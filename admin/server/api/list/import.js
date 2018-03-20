const FormData = require('form-data');
const Papa = require('papaparse');

const parseCSV = (file, fieldData, callback) => {
	Papa.parse(file, {
		header: true,
		dynamicTyping: true,
		// TODO:  We might have issues with big files using all the memory.
		// Unfortunately every possible solution involves huge RAM usage anyways if the CSV is big
		// In fact, stepping threw the rows and dispatching PUTs might make RAM usage worse
		complete (result) {
			const translatedData = [];
			const data = result.data;
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
					translatedRow[path] = row[title];
					// Count the number of empty properties.
					if (!row[title]) {
						emptyFields += 1;
					}

					// Check if the field is a relationship, and fix the data correspondingly
					if (isRelationShip[path]) {
						const relationshipLabel = translatedRow[path];
						let realName = fieldData.relationshipData[path][relationshipLabel];
						if (realName === undefined) {
							console.log(
								'WARNING! References to other models will be omitted because of missing records!'
							);
							realName = '';
						}
						translatedRow[path] = realName;
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
				}
			}
			callback(translatedData);
		},
	});
};

const findItemByFields = (currentData, fields) => {
	return currentData.find(oldItem => {
		Object.keys(fields).forEach(fieldName => {
			const value = fields[fieldName];
			if (oldItem[fieldName] !== value) return false;
		});
		return true;
	});
};
const fixDataPaths = (translatedData, fieldData, currentList, req) => {
	return req.list.model.find().then(currentData => {
		const autoKeySettings = currentList.autokey;
		const addFieldsAndID = data => {
			const itemData = Object.assign({}, data);
			itemData.fields = data;
			if (typeof autoKeySettings !== 'undefined') {
				const fromFields = autoKeySettings.from;
				const searchFields = {};
				fromFields.forEach(fieldData => {
					const path = fieldData.path;
					searchFields[path] = itemData[path];
				});
				const existingItem = findItemByFields(currentData, searchFields);
				if (typeof existingItem !== 'undefined') {
					itemData._id = existingItem._id;
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
	let cbCount = 0;
	let status = 200;
	let error = null;
	const onFinish = () => {
		cbCount -= 1;
		if (cbCount === 0) {
			res.status(status);
			if (error !== null) {
				res.send(error).end();
			} else {
				res.end();
			}
		}
	};
	const updateWrapper = (oldItem, newItem) => {
		req.list.updateItem(
			oldItem !== null ? oldItem : new req.list.model(),
			new FormData(newItem),
			{
				ignoreNoEdit: true,
				user: req.user,
			},
			function (err) {
				if (err) {
					status = err.error === 'validation errors' ? 400 : 500;
					error = err.error === 'database error' ? err.detail : err;
				}
				onFinish();
			}
		);
	};
	items.forEach(newItem => {
		cbCount += 1;
		if (typeof newItem._id !== 'undefined') {
			req.list.model.findById(newItem._id).then(oldItem => {
				delete newItem._id;
				updateWrapper(oldItem, newItem);
			});
		} else {
			updateWrapper(null, newItem);
		}
	});
};

module.exports = function (req, res) {
	var keystone = req.keystone;
	if (!keystone.security.csrf.validate(req)) {
		return res.apiError(403, 'invalid csrf');
	}
	const file = req.body.file;
	const fieldData = JSON.parse(req.body.fieldData);
	const currentListKey = req.body.currentListKey;
	parseCSV(file, fieldData, translatedData => {
		fixDataPaths(
			translatedData,
			fieldData,
			req.keystone.lists[currentListKey],
			req
		).then(itemList => {
			applyUpdate(itemList, res, req);
		});
	});
};
