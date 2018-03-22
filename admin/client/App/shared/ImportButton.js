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
		const formData = new FormData();
		formData.append("csv", this.state.fileData);
		formData.append("fieldData", JSON.stringify(this.state.fieldData));
		formData.append("currentListKey", this.state.currentList.key);
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
		const fileData = acceptedFiles[0];
		this.setState({
			fileData,
			csvData: 1,
			error: null,
			submitActive: true
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
		if (this.state.currentList !== null && !this.state.currentList.csvImport) {
			return null;
		}
		const { fileData, error, csvData } = this.state;
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
		paragraphColor = !error && fileData ? "green" : paragraphColor;
		const paragraphStatus = fileData
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
								{fileData && (
									<li
										key={
											fileData.name // Shows the information about the file
										}
									>
										{fileData.name} - {fileData.size} bytes
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
