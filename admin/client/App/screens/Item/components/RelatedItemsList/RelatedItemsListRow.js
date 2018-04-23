import React, { Component, PropTypes } from 'react';
import assign from 'object-assign';
import { DropTarget, DragSource } from 'react-dnd';

import { Columns, Fields } from 'FieldTypes';

import {
	reorderItems,
	resetItems,
	moveItem,
} from '../../actions';

import ListControl from '../../../List/components/ListControl';
import { objectToFormData } from '../../../../../utils/queryParams';

class RelatedItemsListRow extends Component {
	state = {
		values: {}
	}

	componentWillReceiveProps (nextProps) {
		// if editMode is enabled prepopulate values
		if(nextProps.editMode && !this.props.editMode) {
			const { refList, item } = nextProps;

			refList.loadItem(item.id, { drilldown: true }, (err, itemData) => {
				if(!err) {
					this.prepopulateInput(itemData.fields)
				}
			})
		}
	}

	prepopulateInput = (fields) => {
		this.setState({
			values: fields
		})
	}

	handleChange = (event) => {
		var values = assign({}, this.state.values);

		// if event is a file set event.file as value
		if(event.file) {
			values[event.path] = event.file;
		} else {
			values[event.path] = event.value;
		}
		
		this.setState({
			values: values
		});
	}

	saveItem = () => {
		const { refList, item } = this.props;

		const filteredValues = {};
		const { values } = this.state;

		// filter out any values that are undefined
		for ( let key in values ) {
			if(typeof values[key] !== 'undefined') {
				filteredValues[key] = values[key]
			}
		}
		
		var formData = objectToFormData(filteredValues);

		refList.updateItem(item.id, formData, (err, data) => {
			if(data) {
				this.props.saveItem(item.id)
			} else {
				this.props.setError(err)
			}
		})
	}

	getFieldProps = (field) => {
		var props = assign({}, field);
		props.value = this.state.values[field.path];
		props.values = this.state.values;
		props.onChange = this.handleChange;
		props.mode = 'create';
		props.key = field.path;
		props.hideLabel = true;
		return props;
	}

	render () {
		const { columns, item, connectDragSource, connectDropTarget, refList, editMode } = this.props;
		const cells = columns.map((col, i) => {
			const ColumnType = Columns[col.type] || Columns.__unrecognised__;
			const linkTo = !i ? `${Keystone.adminPath}/${refList.path}/${item.id}` : undefined;
			var fieldProps = this.getFieldProps(col.field);
			var FieldComponent = React.createElement(Fields[col.field.type], fieldProps);

			return (
				this.props.editMode ? <td>{FieldComponent}</td> : <ColumnType key={col.path} list={refList} col={col} data={item} linkTo={linkTo} />
			);
		});

		// add inline edit icon when applicable
		if (refList.inlineEdit && (refList.noedit !== true)) {

			if(editMode) {
				cells.unshift(<ListControl key="_cancelItem" type="cancelItem" onClick={(e) => this.props.cancelItem()}/>)
				cells.unshift(<ListControl key="_saveItem" type="saveItem" onClick={(e) => this.saveItem()}/>)
			} else {
				cells.unshift(<td></td>)
				cells.unshift(<ListControl key="_inlineEdit" type="inlineEdit" onClick={(e) => this.props.changeEditingItemId(item.id)}/>)
			}

		}

		// add sortable icon when applicable
		if (connectDragSource) {
			cells.unshift(<ListControl key="_sort" type="sortable" dragSource={connectDragSource} />);
		}

		const row = (<tr key={'i' + item.id}>{cells}</tr>);

		if (connectDropTarget) {
			return connectDropTarget(row);
		} else {
			return row;
		}
	}
}
RelatedItemsListRow.propTypes = {
	columns: PropTypes.array.isRequired,
	dispatch: PropTypes.func.isRequired,
	dragNewSortOrder: React.PropTypes.number,
	index: PropTypes.number,
	item: PropTypes.object.isRequired,
	refList: PropTypes.object.isRequired,
	relatedItemId: PropTypes.string.isRequired,
	relationship: PropTypes.object.isRequired,
	// Injected by React DnD:
	isDragging: PropTypes.bool,         // eslint-disable-line react/sort-prop-types
	connectDragSource: PropTypes.func,  // eslint-disable-line react/sort-prop-types
	connectDropTarget: PropTypes.func,  // eslint-disable-line react/sort-prop-types
	connectDragPreview: PropTypes.func, // eslint-disable-line react/sort-prop-types
};

module.exports = exports = RelatedItemsListRow;

// Expose Sortable

/**
 * Implements drag source.
 */
const dragItem = {
	beginDrag (props) {
		const send = { ...props };
		// props.dispatch(setDragBase(props.item, props.index));
		return { ...send };
	},
	endDrag (props, monitor, component) {
		// Dropped outside of the drop target, reset rows
		if (!monitor.didDrop()) {
			props.dispatch(resetItems());
			return;
		}

		const draggedItem = props.item;
		const prevSortOrder = draggedItem.sortOrder;
		const newSortOrder = props.dragNewSortOrder;

		// Dropping on self
		if (prevSortOrder === newSortOrder) {
			props.dispatch(resetItems());
			return;
		}

		// dropped on a target
		const { columns, refList, relationship, relatedItemId, item } = props;
		props.dispatch(reorderItems({ columns, refList, relationship, relatedItemId, item, prevSortOrder, newSortOrder }));
	},
};

/**
 * Implements drag target.
 */
const dropItem = {
	drop (props, monitor, component) {
		return { ...props };
	},
	hover (props, monitor, component) {
		// reset row alerts
		// if (props.rowAlert.success || props.rowAlert.fail) {
			// props.dispatch(setRowAlert({
			// 	reset: true,
			// }));
		// }

		const dragged = monitor.getItem().index;
		const over = props.index;

		// self
		if (dragged === over) {
			return;
		}

		// Since the items are moved on hover, we need to store the new sort order from the dragged over item so we can use it to reorder when the item is dropped.
		props.dispatch(moveItem({
			prevIndex: dragged,
			newIndex: over,
			relationshipPath: props.relationship.path,
			newSortOrder: props.item.sortOrder,
		}));
		monitor.getItem().index = over;
	},
};

/**
 * Specifies the props to inject into your component.
 */
function dragProps (connect, monitor) {
	return {
		connectDragSource: connect.dragSource(),
		isDragging: monitor.isDragging(),
		connectDragPreview: connect.dragPreview(),
	};
}

function dropProps (connect) {
	return {
		connectDropTarget: connect.dropTarget(),
	};
};

// exports.Sortable = RelatedItemsListRow;
exports.Sortable = DragSource('item', dragItem, dragProps)(DropTarget('item', dropItem, dropProps)(RelatedItemsListRow));
