// Adding Import Functionality to KeystoneJS Admin via Import Button.

import React from "react";
import { Modal, Button, Alert } from "../elemental";
import Dropzone from "react-dropzone";
import Papa from "papaparse";
const xhr = require("xhr");
import { connect } from "react-redux";

class ImportButton extends React.Component {
	constructor(props) {
		super(props);
		let currentList = props.currentList;
		if (!currentList) {
			currentList = props.lists.data[props.currentPath];
		}
		this.state = {
			open: false,
			error: null,
			csvData: null,
			fieldData: null,
			submitActive: false,
			postDialog: false,
			submitErrors: false,
			postDialogText: "",
			currentList
		};
	}

	applyCSV = () => {
		const list = this.state.currentList;
		this.submitErrors = [];
		this.items = {};
		for (let j = 0; j < this.state.csvData.length; j += 1) {
			const data = this.state.csvData[j];
			const itemData = {};
			const nameField = list.nameField.path;
			const newName = data[nameField];
			const dataKeys = Object.keys(data);
			for (let i = 0; i < dataKeys.length; i += 1) {
				const key = dataKeys[i];
				itemData[key] = data[key];
			}
			itemData["fields"] = data;
			const currentPath = this.state.currentList.path;
			const currentData = this.props.listData[currentPath];
			let itemID = null;
			const items = currentData.items.results;
			for (let i = 0; i < items.length; i += 1) {
				if (items[i].name === newName) {
					itemID = items[i].id;
				}
			}
			if (!itemID) {
				itemData["_id"] = itemID;
			}

			this.items[j] = itemData;
		}
		const jsonString = JSON.stringify(this.items);
		const formData = new FormData();
		formData.append("items", jsonString);
		xhr(
			{
				url: `${Keystone.adminPath}/api/${this.state.currentList.path}/import`,
				method: "POST",
				headers: Object.assign({}, Keystone.csrf.header),
				body: formData
			},
			(err, resp, data) => {
				let error = err;
				const postDialogText = error ? error : "Completed successfully.";
				this.setState({
					submitErrors: error,
					postDialogText,
					postDialog: true
				});
			}
		);
	};

	getFieldData = () => {
		const { currentList } = this.state;
		let titleMap = {};
		let isRelationship = {};
		let relationshipData = {};
		let errorsXHR = [];
		let fetchList = [];
		let fetchListMap = {};
		for (let i = 0; i < currentList.columns.length; i += 1) {
			const col = currentList.columns[i];
			titleMap[col.title] = col.path;
			if (typeof col.field !== "undefined") {
				if (col.field.type === "relationship") {
					isRelationship[col.path] = true;
					fetchList.push(col.field.refList.path);
					fetchListMap[col.field.refList.path] = col.path;
				} else {
					isRelationship[col.path] = false;
				}
			}
		}
		const self = this;
		const promises = fetchList.map(path => {
			const promise = new Promise(function(resolve, reject) {
				var xmlRequest = new XMLHttpRequest();
				xmlRequest.onreadystatechange = function() {
					if (xmlRequest.readyState == 4) {
						if (xmlRequest.status == 200) resolve(xmlRequest.responseText);
						else
							reject(
								self.showError(
									"WARNING! Failed fetching related database entries!"
								)
							);
					}
				};
				xmlRequest.open("GET", Keystone.adminPath + "/api/" + path, true);
				xmlRequest.setRequestHeader(
					"Content-Type",
					"application/x-www-form-urlencoded"
				);
				xmlRequest.setRequestHeader("Accept", "application/json");
				xmlRequest.send(null);
			});
			return promise.then(JSON.parse).then(result => {
				let relationshipMap = {};
				for (let i = 0; i < result.results.length; i += 1) {
					const item = result.results[i];
					relationshipMap[item.name] = item.id;
				}
				const realPath = fetchListMap[path];
				relationshipData[realPath] = relationshipMap;
				return result;
			});
		});
		Promise.all(promises).then(function() {
			self.setState({
				fieldData: {
					titleMap,
					isRelationship,
					errorsXHR,
					relationshipData
				}
			});
		});
	};

	handlePostDialogClose = () => {
		// You can't close it.
	};

	// The file is being parsed and translated after being dropped (or opened).
	onDrop = acceptedFiles => {
		const file = acceptedFiles[0];
		const self = this;
		Papa.parse(file, {
			header: true,
			dynamicTyping: true,
			// TODO:  We might have issues with big files using all the memory.
			// Unfortunately every possible solution involves huge RAM usage anyways if the CSV is big
			// In fact, stepping threw the rows and dispatching PUTs might make RAM usage worse
			complete(result) {
				let errorText = null;
				const translatedData = [];
				const data = result.data;
				for (let i = 0; i < data.length; i += 1) {
					const row = data[i];
					const translatedRow = {};
					const rowKeys = Object.keys(row);
					let emptyFields = 0;
					const paths = [];
					const fieldData = self.state.fieldData;
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
							let realName =
								fieldData.relationshipData[path][relationshipLabel];
							if (realName === undefined) {
								errorText =
									"WARNING! References to other models will be omitted because of missing records!";
								realName = "";
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
				self.setState({
					file,
					csvData: translatedData,
					error: errorText,
					submitActive: true
				});
			}
		});
	};

	onPostModalButton = () => {
		if (this.props.rerenderCallback) {
			this.props.rerenderCallback();
		} else {
			window.location.reload();
			this.setState({ postDialog: false });
		}
	};
	onDropRejected = () => {
		this.showError("File loading rejected.");
	};

	showError = error => {
		// Shows a red error instead of instruction in case something goes wrong.
		this.setState({ error, submitActive: false });
	};
	handleOpen = e => {
		e.preventDefault();
		this.setState({ open: true });
		this.getFieldData();
	};

	handleClose = () => {
		this.setState({ open: false });
	};

	render() {
		if (
			this.props.lists.currentList !== null &&
			!this.props.lists.currentList.csvImport
		) {
			return null;
		}
		const { file, error, csvData } = this.state;
		const actions = [
			<Button
				onClick={this.handleClose}
				key="actions-cancel"
				style={{ marginLeft: "auto" }}
			>
				Cancel
			</Button>,
			// This is the button responsible for pushing the data to the server.
			<Button
				color="primary"
				disabled={!this.state.submitActive}
				onClick={this.applyCSV}
				key="actions-submit"
				style={{ marginLeft: "10px" }}
			>
				Submit
			</Button>
		];
		const dropZoneStyle = {
			display: "flex",
			justifyContent: "center",
			padding: "10px",
			textAlign: "center",
			backgroundColor: "rgba(153,153,153,0.2)",
			margin: "10px"
		};
		// Error/hint colors and texts are determined here
		let paragraphColor = error ? "red" : "rgba(0,0,0,0.6)";
		paragraphColor = !error && file ? "green" : paragraphColor;
		const paragraphStatus = file
			? "File loaded! Press submit to apply changes."
			: "Drop CSV file here, or click to select file to upload.";

		// Sometimes we need only an icon
		const mainButton = (
			<Button
				color="primary"
				onClick={this.handleOpen}
				style={{ marginRight: "20px" }}
			>
				Import
			</Button>
		);
		const mainIcon = (
			<a
				onClick={this.handleOpen}
				className="dashboard-group__list-create octicon octicon-cloud-upload"
				style={{ position: "absolute", top: "36px" }}
				title="Import"
			/>
		);
		return (
			<div className={this.props.mini ? "dashboard-group__list-inner" : ""}>
				{this.props.mini ? mainIcon : mainButton}
				<Modal.Dialog
					isOpen={this.state.open}
					onCancel={this.handleClose}
					onClose={this.handleClose}
					backdropClosesModal
				>
					<Modal.Header text="Import your data" />
					<section>
						<div className="dropzone">
							<Dropzone
								style={dropZoneStyle}
								onDrop={this.onDrop}
								onDropRejected={this.onDropRejected}
							>
								<p style={{ color: paragraphColor }}>
									{error || paragraphStatus}
								</p>
							</Dropzone>
						</div>
						<aside>
							<h2>Selected file</h2>
							<ul>
								{file && (
									<li
										key={
											file.name // Shows the information about the file
										}
									>
										{file.name} - {file.size} bytes
									</li>
								)}
							</ul>
						</aside>
					</section>
					<Modal.Footer>{actions}</Modal.Footer>
				</Modal.Dialog>
				<Modal.Dialog
					isOpen={this.state.postDialog}
					onCancel={this.handlePostDialogClose}
					onClose={this.handlePostDialogClose}
					backdropClosesModal={this.props.rerenderCallback ? false : true}
				>
					<Modal.Body>
						<Alert color={this.state.submitErrors ? "danger" : "success"}>
							<p>{this.state.postDialogText}</p>
						</Alert>
					</Modal.Body>
					<Modal.Footer>
						<Button style={{ margin: "auto" }} onClick={this.onPostModalButton}>
							{this.props.rerenderCallback ? "Reload Data" : "Close"}
						</Button>
					</Modal.Footer>
				</Modal.Dialog>
			</div>
		);
	}
}

export default connect(state => ({
	listData: state.lists.data,
	lists: state.lists
}))(ImportButton);
