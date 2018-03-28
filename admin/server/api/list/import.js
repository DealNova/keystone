const FormData = require('form-data');
const Papa = require('papaparse');
const moment = require('moment');
const fs = require('fs');
const utils = require('keystone-utils');

const parseCSV = (file, fileData, fieldData, callback) => {
	Papa.parse(file, {
		header: true,
		dynamicTyping: true,
		// TODO:  We might have issues with big files using all the memory.
		// Unfortunately every possible solution involves huge RAM usage anyways if the CSV is big
		// In fact, stepping threw the rows and dispatching PUTs might make RAM usage worse
		complete (result) {
			const translatedData = [];
			const data = result.data;
			console.log(
				`CSV-Import: PapaParse detected ${data.length} items in the CSV file ${
					fileData.originalname
				}.`
			);
			for (let i = 0; i < data.length; i += 1) {
				const row = data[i];
				const translatedRow = {};
				const rowKeys = Object.keys(row);
				let emptyFields = 0;
				const paths = [];
				const titleMap = fieldData.titleMap;
				const isRelationShip = fieldData.isRelationship;
				for (let j = 0; j < rowKeys.length; j += 1) {
					const title = rowKeys[j];
					// In case of missing title configuration, use the titles themselves as paths.
					const path = titleMap[title] || title;
					paths.push(path);
					translatedRow[path]
						= row[title] !== '' || typeof row[title] === 'undefined'
							? row[title]
							: undefined;
					// Count the number of empty properties.
					if (typeof translatedRow[path] === 'undefined') {
						emptyFields += 1;
					}

					// Check if the field is a relationship, and fix the data correspondingly
					if (typeof isRelationShip[path] !== 'undefined') {
						const relationshipLabel = translatedRow[path];
						const realItem = isRelationShip[path][relationshipLabel];
						let realID = null;
						if (typeof realItem !== 'undefined') {
							realID = realItem.id;
						}
						if (realID === null) {
							console.log(
								`WARNING! References to other models will be omitted because of missing records for ${path}/${relationshipLabel}!`
							);
						} else {
							console.log(
								`CSV-Import: ${path}/${relationshipLabel} detected to be a relationship. Real ID: ${realID}.`
							);
						}
						translatedRow[path] = realID;
					}
					// Make sure the ID has the correct path if exists
					if (typeof translatedRow.id !== 'undefined') {
						translatedRow._id = translatedRow.id;
						delete translatedRow.id;
					}
				}
				// If all the properties are empty, ignore the line.
				// CSV files commonly leave empty lines in the end of the document
				if (emptyFields !== paths.length) {
					translatedData.push(translatedRow);
				} else {
					console.log(
						`CSV-Import: Removing a line due to it being empty. File: ${
							fileData.originalname
						}`
					);
				}
			}
			callback(translatedData);
		},
	});
};

const findItemByFields = (currentData, searchFields, fieldData) => {
	return currentData.find(oldItem => {
		let isMatch = true;
		Object.keys(searchFields).forEach(fieldName => {
			const newValue = searchFields[fieldName];
			const oldValue = oldItem[fieldName];
			if (oldValue !== newValue) {
				// Double check if it's a date object
				if (
					fieldData[fieldName].type === 'date'
					|| fieldData[fieldName].type === 'datetime'
				) {
					const defaultFormat = 'YYYY-MM-DD h:m:s a'; // To prevent deprecation warning by momentjs
					const newDate = moment(newValue, defaultFormat);
					const oldDate = moment(oldValue, defaultFormat);
					if (!newDate.isSame(oldDate)) {
						isMatch = false;
					}
				} else {
					isMatch = false;
				}
			}
		});
		return isMatch;
	});
};

const generateKey = (itemData, autoKeySettings) => {
	const values = [];
	autoKeySettings.from.forEach(ops => {
		values.push(itemData[ops.path]);
	});
	return utils.slug(values.join(' '), null, {
		locale: autoKeySettings.locale,
	});
};

const fixDataPaths = (translatedData, fieldData, currentList, req) => {
	return req.list.model.find().then(currentData => {
		const autoKeySettings = currentList.autokey;
		// Generate key-> item mapping for fast access if !unique
		let currentKeys = {};
		if (!autoKeySettings.unique) {
			const keyPath = autoKeySettings.path;
			currentData.forEach(oldItem => {
				currentKeys[oldItem[keyPath]] = oldItem;
			});
		}
		const addFieldsAndID = itemData => {
			if (typeof autoKeySettings !== 'undefined') {
				const searchFields = {};
				if (autoKeySettings.unique) {
					autoKeySettings.from.forEach(fieldData => {
						const path = fieldData.path.replace(/,/g, '');
						searchFields[path] = itemData[path];
					});
					const existingItem = findItemByFields(
						currentData,
						searchFields,
						req.list.fields
					);
					if (typeof existingItem !== 'undefined') {
						itemData._id = existingItem._id;
					}
				} else {
					// Assume key generation and check for an existing item
					const newKey = generateKey(itemData, autoKeySettings);
					if (typeof currentKeys[newKey] !== 'undefined') {
						itemData._id = currentKeys[newKey]._id;
					}
				}
			}
			return itemData;
		};
		const allItems = [];
		for (let j = 0; j < translatedData.length; j += 1) {
			const data = translatedData[j];
			allItems.push(addFieldsAndID(data));
		}
		return allItems;
	});
};

const applyUpdate = (items, res, req) => {
	let updateCBCount = 0;
	let updateTaskID = 0;
	let updateCount = 0;
	let actualUpdateCount = 0;
	let createCount = 0;
	let updateErrorCount = 0;
	let createErrorCount = 0;
	const failedTasks = [];
	let status = 200;
	let error = null;
	const onFinish = () => {
		res.status(status);
		console.log(`CSV-Import: ${updateCount} items attempted to update.`);
		console.log(`CSV-Import: ${updateErrorCount} update errors.`);
		console.log(`CSV-Import: ${actualUpdateCount} actual updates.`);
		console.log(`CSV-Import: ${createCount} items attempted to create.`);
		if (createErrorCount > 0) {
			console.log(`CSV-Import: Failed to create items.`);
		} else {
			console.log('CSV-Import: No item creation errors reported.');
		}
		if (failedTasks.length > 0) {
			console.log(
				`CSV-Import: Failed update tasks: ${failedTasks.toString()}.`
			);
		}
		if (error !== null) {
			res.send(error).end();
		} else {
			res.end();
		}
	};
	const updateItem = (id, newData) => {
		console.log(`CSV-Import: Updating ${id}. Task ${updateTaskID}.`);
		req.list.model.findById(id).then(oldItem => {
			delete newData._id;
			req.list.updateItem(
				oldItem,
				new FormData(newData),
				{
					ignoreNoEdit: true,
					user: req.user,
				},
				function (err) {
					if (err) {
						status = err.error === 'validation errors' ? 400 : 500;
						error = err.error === 'database error' ? err.detail : err;
						console.log(
							`CSV-Import: Error while updating ${
								oldItem.id
							}. Task ${updateTaskID}. ${err.error}`
						);
						updateErrorCount += 1;

						console.log('CSV-Import: Error object:', err);
						console.log('CSV-Import: Data object:', newData);
						failedTasks.push(updateTaskID);
					} else {
						actualUpdateCount += 1;
					}
					updateCBCount -= 1;
					if (updateCBCount === 0) {
						onUpdateEnd();
					}
				}
			);
		});
	};

	const createItems = itemList => {
		const modelName = req.list.key;
		const createData = {
			[modelName]: itemList,
		};
		req.keystone.createItems(createData, err => {
			if (err) {
				status = err.error === 'validation errors' ? 400 : 500;
				error = err.error === 'database error' ? err.detail : err;
				console.log(`CSV-Import: Error while creating new items. ${err.error}`);
				createErrorCount += 1;
				console.log('CSV-Import: Error object:', err);
			}
			onCreateEnd();
		});
	};

	const onUpdateEnd = () => {
		console.log('CSV-Import: Creating new records.');
		if (createList.length > 0) {
			createItems(createList);
		} else {
			console.log('CSV-Import: No new records found.');
			onCreateEnd();
		}
	};
	const onCreateEnd = () => {
		onFinish();
	};

	const updateList = {};
	const createList = [];

	items.forEach(item => {
		if (typeof item._id !== 'undefined') {
			updateCount += 1;
			updateList[item._id] = item;
		} else {
			createCount += 1;
			createList.push(item);
		}
	});

	console.log('CSV-Import: Updating existing records.');
	const updateIDs = Object.keys(updateList);
	if (updateIDs.length > 0) {
		updateIDs.forEach(updateID => {
			updateCBCount += 1;
			updateTaskID += 1;
			updateItem(updateID, updateList[updateID]);
		});
	} else {
		console.log('CSV-Import: No existing records found eligible for updates.');
		onUpdateEnd();
	}
};

const startImport = (file, fileData, fieldData, req, res) => {
	parseCSV(file, fileData, fieldData, translatedData => {
		fixDataPaths(translatedData, fieldData, req.list, req).then(itemList => {
			applyUpdate(itemList, res, req);
		});
	});
};

module.exports = function (req, res) {
	var keystone = req.keystone;
	if (!keystone.security.csrf.validate(req)) {
		return res.apiError(403, 'invalid csrf');
	}
	const fileData = req.files.csv;
	const file = fs.readFileSync(fileData.path, 'utf8');
	const fieldData = { titleMap: {}, isRelationship: {} };
	Object.keys(req.list.fields).forEach(fieldPath => {
		fieldData.titleMap[req.list.fields[fieldPath].label] = fieldPath;
	});
	const relationshipFetches = [];
	req.list.relationshipFields.forEach(relationshipField => {
		const relatedList = req.keystone.lists[relationshipField.options.ref];
		const fetchAction = relatedList.model.find().then(relatedListItems => {
			const idMapping = {};
			const mapKey = relatedList.mappings.name;
			relatedListItems.forEach(item => {
				let itemName = item[mapKey];
				if (typeof itemName === 'object') {
					const itemType = relatedList.fieldTypes[mapKey];
					if (itemType === 'Name') {
						itemName = itemName.full;
					}
				}
				idMapping[itemName] = item;
			});
			fieldData.isRelationship[relationshipField.path] = idMapping;
			fieldData.isRelationship[relationshipField.label] = idMapping;
			return true;
		});
		relationshipFetches.push(fetchAction);
	});
	if (relationshipFetches.length) {
		Promise.all(relationshipFetches).then(status => {
			startImport(file, fileData, fieldData, req, res);
		});
	} else {
		startImport(file, fileData, fieldData, req, res);
	}
};
