var group = module.exports;

var _ = require('lodash');
var numberformat = require('../lib/numberformat');
var CALCULABLE_FIELDS = ['LineExtensionAmount', 'Quantity'];
var NON_CALCULABLE_FIELDS = ['UnitCode', 'ItemId', 'Tax', 'Price'];

var Group = function(members, failure) {
	this.members = members || []; // List of line ids which defines the group
	this.lines = []; // List of line objects as retrieved from the document resource
	this.failure = failure; // The matching failure for the group (retrieved from the matching resource)
	this.failureDescriptions = []; // Human readable descriptions of matching errors.
	this.lineReferenceError = !!this.failure.Fields.LineReferenceId;
};


/** 'Static' methods for groups **/
/**
 * Gets the group of the specified line id.
 * @param groups The groups to search (two-dimensional array)
 * @param lineId The line id to search for
 * @returns {*|Mixed} the group the line id belongs to
 */
group.getGroupForLine = function(groups, lineId) {
	return _.find(groups, function(group) {
		return group.contains(lineId);
	});
};

/**
 * Returns true if the specified groups contains the specified line id.
 * @param groups The groups as a two-dimensional array (array of arrays)
 * @param lineId The line id to search for
 * @returns {boolean|*|Boolean} true if line id is present in any of the groups; otherwise false
 */

group.contains = function(groups, lineId) {
	return !_.isUndefined(_.find(groups, function(group) {
		return group.contains(lineId);
	}));
};


/** 'Class' methods**/
Group.prototype.add = function(member) {
	this.members.push(member);
};

Group.prototype.contains = function(member) {
	return _.contains(this.members, member);
};

Group.prototype.isGroup = function() {
	return true;
};

/**
 * Makes human readable errors for the mismatches.
 * @param fieldLabels The labels used for fields by the document, maps field type to a label, (from doc viewProfile).
 * @param unitLabels The labels for the units used in each field.
 * @returns {Array} the error descriptions for each field that failed the match.
 */
Group.prototype.makeErrorDescription = function(fieldLabels, unitLabels){
	var self = this;

	var makeLineReferenceErrorDescription = function(lineRefeference) {
		return 'Order line reference ' + lineRefeference.Error.ErrorDetail[0].Value +  ' not found.';
	};

	var makeMismatchDescription = function(field, labels) {
		var mainValue = field.Value;
		var baseValue = field.BaseValue;

		if(!_.contains(['UnitCode', 'ItemId'], field.Type)) {
			mainValue = numberformat.formatNumberInput(mainValue);
			baseValue = numberformat.formatNumberInput(baseValue);
		}

		var fieldName = labels[field.Type].label.toLowerCase();
		var desc = '';

		//Make appropriate description of error depending if field is calculable or real non-calculable.
		if (_.contains(NON_CALCULABLE_FIELDS, field.Type)) {
			//Non-calculable field case error description
			if(field.Type === 'UnitCode') {
				desc += 'The ' + fieldName + ' field (' + unitLabels[mainValue].label + ') ';
				desc += 'is not matching the PO '+ fieldName + ' field (' + unitLabels[baseValue].label + ')';
			} else {
				desc += 'The ' + fieldName + ' field (' + mainValue + ') ';
				desc += 'is not matching the PO ' + fieldName + ' field ('+ baseValue + ')';
			}
		} else {
			//Calculable field case error description
			//Do we have calculation ?
			desc = self.hasCalculation() ? 'The total accumulated ' : 'The ';

			//Add field name and value to description
			desc += fieldName.toLowerCase() + ' (' + mainValue + ')';

			//If we have calculations from target documents add the document types
			if (self.hasTargetDocumentsLineReferences()) {
				//Make target document types description part
				//Get document types
				var targetDocumentTypes = self.getTargetDocumentTypes();
				//Pluralize all
				targetDocumentTypes = _.map(targetDocumentTypes, function(t){
					return (t + 's');
				});
				//Add target document types to description
				desc += (' across multiple ' + targetDocumentTypes.join(' and '));
			}

			//Add PO line reference description
			desc += ' is exceeding the PO ' + fieldName + ' (' + baseValue + ')';

			//Finally, add tolerances to description, if present
			if (self.hasTolerances()) {
				desc += ' by more than the allowed tolerance (' + field.ThresholdDeltaValue + ')';
			}
		}

		//Return and ddd ending dot
		return desc + '.';
	};

	if (this.failure) {
		if (this.failure.Fields && this.failure.Fields.LineReferenceId) {
			this.failureDescriptions = [{ FieldName: 'LineReferenceId', Description: makeLineReferenceErrorDescription(this.failure.Fields.LineReferenceId) }];
		} else {
			this.failureDescriptions = _.map(this.failure.Fields, function(field) {
				return { FieldName: fieldLabels[field.Type] ? fieldLabels[field.Type].label : field.Type, Description: makeMismatchDescription(field, fieldLabels) };
			});
		}
	}
};

/**
 * Method to get all document types found in the target document list for the group.
 * @returns {Array} document types of target document list for group;
 */
Group.prototype.getTargetDocumentTypes = function() {
	return _.unique(_.map(this.failure.TargetAccumulation.Parts, function(e){
		return e.DocumentType.toLocaleLowerCase();
	})).sort();
};

/**
 * Method to get the PO reference for this line..
 * @returns {Object} PO reference object if any; otherwise null;
 */
Group.prototype.getPurchaseOrder = function() {
	return _.findWhere(this.failure.BaseAccumulation.Parts, { DocumentType: 'ORDER' });
};

/**
 * Method to check  if the specified groups contains the specified line id.
 * @param groups The groups as a two-dimensional array (array of arrays)
 * @param lineId The line id to search for
 * @returns {boolean|*|Boolean} true if line id is present in any of the groups; otherwise false
 */
Group.prototype.hasTargetDocumentsLineReferences = function() {
	return (this.failure.TargetAccumulation.Parts && this.failure.TargetAccumulation.Parts.length >= 1);
};

/**
 * Method to check  if the group contains matching failures on fields with continuous values (e.g. Line amount)
 * @returns {boolean|*|Boolean} true if the group contains matching failures on fields with continuous values; otherwise false
 */
Group.prototype.hasMismatchesOnContinuousValuedFields = function() {
	return _.any(this.failure.Fields, function(field){
		return _.contains(CALCULABLE_FIELDS, field.Type);
	});
};

/**
 * Method to check if the group has more than one main line.
 * @param groups The groups as a two-dimensional array (array of arrays)
 * @param lineId The line id to search for
 * @returns {boolean|*|Boolean} true if line id is present in any of the groups; otherwise false
 */
Group.prototype.hasMultipleLines = function() {
	return (this.lines.length > 1);
};

/**
 * Method to check if the group contains calculations for mismatches on continuous values.
 * (i.e. we have multiple lines in the current document or multiple reference lines)
 * @returns {boolean|*|Boolean} true if calculations present; otherwise false
 */
Group.prototype.hasCalculation = function() {
	return (this.hasTargetDocumentsLineReferences() || this.hasMultipleLines()) && this.hasMismatchesOnContinuousValuedFields();
};

/**
 * Method to check if the group contains information on tolerances.
 * @returns {boolean|*|Boolean} true if the group contains information on tolerances; otherwise false
 */
Group.prototype.hasTolerances = function() {
	return _.any(this.failure.Fields, function(field){
		return (field.ThresholdDeltaValue && field.ThresholdDeltaValue !== '0');
	});
};

/**
 * Returns the raw mismatch error codes.
 * @returns {Array} collection of matching raw errorcodes for this group of lines.
 */
Group.prototype.getMatchingErrorCodes = function() {
	if (this.failure) {
		return _.map(this.failure.Fields, function(field) {
			return field.Error.ErrorCode;
		});
	}

	return [];
};

Group.prototype.showAccordion = function() {
	return !_.isUndefined(this.failure.TargetAccumulation.Parts);
};

group.create = function(members, failure) {
	return new Group(members, failure);
};
