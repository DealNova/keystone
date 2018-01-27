import React, { PropTypes } from 'react';
import {
	Button,
	GlyphButton,
	InlineGroup as Group,
	InlineGroupSection as Section,
	Spinner,
} from '../../../elemental';

import ImportButton from '../../../shared/ImportButton';

function ButtonDivider ({ style, ...props }) {
	props.style = {
		borderLeft: '1px solid rgba(0, 0, 0, 0.1)',
		paddingLeft: '0.75em',
		...style,
	};
}

function ListManagement ({
	list,
	checkedItemCount,
	handleDelete,
	handleSelect,
	handleToggle,
	isOpen,
	itemCount,
	itemsPerPage,
	nodelete,
	noedit,
	createIsAvailable,
	selectAllItemsLoading,
	...props
}) {
	// do not render if there's no results
	// or if edit/delete unavailable on the list
	if (!itemCount || (nodelete && noedit)) return null;

	const buttonNoteStyles = { color: '#999', fontWeight: 'normal' };

	// delete button
	const actionButtons = isOpen && (
		<Section>
			<GlyphButton
				color="cancel"
				disabled={!checkedItemCount}
				glyph="trashcan"
				onClick={handleDelete}
				position="left"
				variant="link">
				Delete
			</GlyphButton>
		</Section>
	);

	// select buttons
	const allVisibleButtonIsActive = checkedItemCount === itemCount;
	const pageVisibleButtonIsActive = checkedItemCount === itemsPerPage;
	const noneButtonIsActive = !checkedItemCount;
	const selectAllButton = itemCount > itemsPerPage && (
		<Section>
			<Button
				active={allVisibleButtonIsActive}
				onClick={() => handleSelect('all')}
				title="Select all rows (including those not visible)">
				{selectAllItemsLoading ? <Spinner/> : 'All'} <small style={buttonNoteStyles}>({itemCount})</small>
			</Button>
		</Section>
	);

	const selectButtons = isOpen ? (
		<Section>
			<Group contiguous>
				{selectAllButton}
				<Section>
					<Button active={pageVisibleButtonIsActive} onClick={() => handleSelect('visible')} title="Select all rows">
						{itemCount > itemsPerPage ? 'Page ' : 'All '}
						<small style={buttonNoteStyles}>({itemCount > itemsPerPage ? itemsPerPage : itemCount})</small>
					</Button>
				</Section>
				<Section>
					<Button active={noneButtonIsActive} onClick={() => handleSelect('none')} title="Deselect all rows">None</Button>
				</Section>
			</Group>
		</Section>
	) : null;

	// selected count text
	const selectedCountText = isOpen ? (
		<Section>
			<span style={{ color: '#666', display: 'inline-block', lineHeight: '2.4em', margin: 1 }}>
				{checkedItemCount} selected
			</span>
		</Section>
	) : null;

	// put it all together
	return (
		<div>
			<Group style={{ float: 'left', marginRight: '.75em', marginBottom: 0 }}>
				<Section>
					<Button active={isOpen} onClick={() => handleToggle(!isOpen)}>
						Manage
					</Button>
				</Section>
				{createIsAvailable
				&& <Section>
					<ImportButton
						currentList={list}
							/>
				</Section>}
				{selectButtons}
				{actionButtons}
				{selectedCountText}
			</Group>
		</div>
	);
};

ListManagement.propTypes = {
	checkedItems: PropTypes.number,
	handleDelete: PropTypes.func.isRequired,
	handleSelect: PropTypes.func.isRequired,
	handleToggle: PropTypes.func.isRequired,
	isOpen: PropTypes.bool,
	itemCount: PropTypes.number,
	itemsPerPage: PropTypes.number,
	nodelete: PropTypes.bool,
	noedit: PropTypes.bool,
	selectAllItemsLoading: PropTypes.bool,
};

module.exports = ListManagement;
