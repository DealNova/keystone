const FormData = require('form-data');
const Papa = require('papaparse');
const fs = require('fs');
const utils = require('keystone-utils');

const parseCSV = (file, fileData, fieldData, callback) => {
	Papa.parse(file, {
		header: true,
		dynamicTyping: false,
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

const generateKey = (itemData, autoKeySettings, currentList) => {
	const values = [];
	autoKeySettings.from.forEach(ops => {
		values.push(itemData[ops.path]);
	});
	return utils.slug(values.join(' '), null, {
		locale: autoKeySettings.locale,
	});
};

const fixDataPaths = (translatedData, fieldData, currentList, req) => {
	return currentList.model.find().then(currentData => {
		const autoKeySettings = currentList.autokey;
		let searchID = 0;
		// Generate key-> item mapping for fast access if !unique
		const currentKeys = {};
		const registeredKeys = [];
		const keyPath = autoKeySettings.path;
		currentData.forEach(oldItem => {
			registeredKeys.push(oldItem[keyPath]);
			currentKeys[oldItem[keyPath]] = oldItem;
		});

		const addFieldsAndID = itemData => {
			if (typeof autoKeySettings !== 'undefined') {
				searchID += 1;
				console.log(
					`CSV-Import: Searching for a matching existing record. SearchID: ${searchID}/${
						translatedData.length
					}.`
				);
				// Assume key generation and check for an existing item
				const newKey = generateKey(itemData, autoKeySettings, currentList);
				if (typeof currentKeys[newKey] !== 'undefined') {
					itemData._id = currentKeys[newKey]._id || currentKeys[newKey].id;
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

const applyUpdate = (items, list, res, req) => {
	let cbCount = 0;
	let taskID = 0;
	let updateCount = 0;
	let createCount = 0;
	let updateErrorCount = 0;
	let createErrorCount = 0;
	const failedTasks = [];
	let status = 200;
	const onFinish = () => {
		cbCount -= 1;
		if (cbCount === 0) {
			res.status(status);
			console.log(
				`CSV-Import: ${items.length} items detected in the CSV file.`
			);
			console.log(`CSV-Import: ${updateCount} items updated.`);
			console.log(`CSV-Import: ${createCount} items created.`);
			console.log(`CSV-Import: ${updateErrorCount} update errors.`);
			console.log(`CSV-Import: ${createErrorCount} create errors.`);
			if (failedTasks.length > 0) {
				console.log(`CSV-Import: Failed tasks: ${failedTasks.toString()}.`);
			}
			res.send({
				items: items.length,
				updateCount,
				createCount,
				updateErrorCount,
				createErrorCount,
			});
		}
	};
	const updateWrapper = (oldItem, newItem, taskID) => {
		list.updateItem(
			oldItem !== null ? oldItem : new list.model(),
			new FormData(newItem),
			{
				ignoreNoEdit: true,
				user: req.user,
			},
			function (err) {
				if (err) {
					status = err.error === 'validation errors' ? 400 : 500;
					if (oldItem !== null && oldItem._id) {
						console.log(
							`CSV-Import: Error while updating ${
								oldItem.id
							}. Task ${taskID}. ${err.error}`
						);
						updateErrorCount += 1;
					} else {
						console.log(
							`CSV-Import: Error while creating a new item. Task ${taskID}. ${
								err.error
							}`
						);
						createErrorCount += 1;
					}
					console.log('CSV-Import: Error object:', err);
					console.log('CSV-Import: Data object:', newItem);
					failedTasks.push(taskID);
				}
				onFinish();
			}
		);
	};
	items.forEach(newItem => {
		cbCount += 1;
		taskID += 1;
		if (typeof newItem._id !== 'undefined') {
			console.log(`CSV-Import: Updating ${newItem._id}. Task ${taskID}.`);
			updateCount += 1;
			list.model.findById(newItem._id).then(oldItem => {
				delete newItem._id;
				updateWrapper(oldItem, newItem, taskID);
			});
		} else {
			console.log(`CSV-Import: Creating a new item. Task ${taskID}.`);
			createCount += 1;
			updateWrapper(null, newItem, taskID);
		}
	});
};

const startImport = (file, fileData, fieldData, list, req, res) => {
	parseCSV(file, fileData, fieldData, translatedData => {
		fixDataPaths(translatedData, fieldData, list, req).then(itemList => {
			applyUpdate(itemList, list, res, req);
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
	let list = req.list;
	const modelOverride = req.list.options.csvImportModel;
	if (modelOverride !== null) {
		console.log(
			`CSV-Import: Overriding import model of ${
				req.list.key
			} with ${modelOverride}.`
		);
		list = req.keystone.lists[modelOverride];
	}
	if (typeof list === 'undefined') {
		console.log(`CSV-Import: ERROR: Undefined list. Aborting.`);
		res.apiError(500, 'Internal error.');
		return null;
	}
	Object.keys(list.fields).forEach(fieldPath => {
		fieldData.titleMap[list.fields[fieldPath].label] = fieldPath;
	});
	const relationshipFetches = [];
	list.relationshipFields.forEach(relationshipField => {
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
			startImport(file, fileData, fieldData, list, req, res);
		});
	} else {
		startImport(file, fileData, fieldData, list, req, res);
	}
};
