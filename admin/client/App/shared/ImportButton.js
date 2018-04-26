// Adding Import Functionality to KeystoneJS Admin via Import Button.

import React from "react";
import { Modal, Button, Alert } from "../elemental";
import Dropzone from "react-dropzone";
import Papa from "papaparse";
const xhr = require("xhr");
import { connect } from "react-redux";
const flatFile = require('flatfile-csv-importer');

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
			currentList
		};
	}

	applyCSV = () => {
		const formData = new FormData();
		formData.append("csv", this.state.fileData);
		xhr(
			{
				url: `${Keystone.adminPath}/api/${this.state.currentList.path}/import`,
				method: "POST",
				headers: Object.assign({}, Keystone.csrf.header),
				body: formData
			},
			(err, resp, data) => {
				const responseData = JSON.parse(resp.body);
				this.setState({
					postDialog: true,
					responseData
				});
			}
		);
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
	};

	handleClose = () => {
		this.setState({ open: false });
	};

	componentDidMount () {
		console.log(this.state.currentList, 'this.state.currentList')
		console.log(flatFile)
	}

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
						{this.state.responseData && (
							<Alert color="success">
								<p>{`${
									this.state.responseData.items
								} items detected in the CSV file.`}</p>
								<p>{`${this.state.responseData.updateCount} items updated.`}</p>
								<p>{`${this.state.responseData.createCount} items created.`}</p>
								<p>{`${
									this.state.responseData.updateErrorCount
								} update errors.`}</p>
								<p>{`${
									this.state.responseData.createErrorCount
								} create errors.`}</p>
							</Alert>
						)}
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
