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
					const path = titleMap[title];
					if (titleMap.hasOwnProperty(title)) {
						paths.push(path);
						translatedRow[path] = row[title];
						// Count the number of empty properties.
						if (!row[title]) {
							emptyFields += 1;
						}
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

const fixDataPaths = (translatedData, listData) => {
	const finalItems = {};
	for (let j = 0; j < translatedData.length; j += 1) {
		const data = translatedData[j];
		const itemData = {};
		const dataKeys = Object.keys(data);
		for (let i = 0; i < dataKeys.length; i += 1) {
			const key = dataKeys[i];
			itemData[key] = data[key];
		}
		itemData.fields = data;
		finalItems[j] = itemData;
	}
	return finalItems;
};

const applyUpdate = (items, res, req) => {
	let cbCount = 0;
	let status = 200;
	let error = null;
	Object.keys(items).forEach(key => {
		const newItem = items[key];
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
		cbCount += 1;
		updateWrapper(null, newItem);
	});
};

module.exports = function (req, res) {
	var keystone = req.keystone;
	if (!keystone.security.csrf.validate(req)) {
		return res.apiError(403, 'invalid csrf');
	}
	const file = req.body.file;
	const fieldData = JSON.parse(req.body.fieldData);
	const listData = keystone.lists;
	parseCSV(file, fieldData, translatedData => {
		const finalItems = fixDataPaths(translatedData, listData);
		applyUpdate(finalItems, res, req);
	});
};
