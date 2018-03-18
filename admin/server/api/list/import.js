const FormData = require('form-data');

module.exports = function (req, res) {
	var keystone = req.keystone;
	if (!keystone.security.csrf.validate(req)) {
		return res.apiError(403, 'invalid csrf');
	}
	const items = JSON.parse(req.body.items);
	let cbCount = 0;
	let status = 200;
	let error = null;
	Object.keys(items).forEach(key => {
		const newItem = items[key];
		const id = newItem._id;
		delete newItem._id;
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
		if (!id) {
			updateWrapper(null, newItem);
		} else {
			req.list.model.findByID(id, (err, oldItem) => {
				if (err) {
					error = 'database error';
					status = 500;
					onFinish();
					return null;
				}
				if (!oldItem) {
					error = 'not found';
					status = 404;
					onFinish();
					return null;
				}
				updateWrapper(oldItem, newItem);
			});
		}
	});
};
