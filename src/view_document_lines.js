var viewDocumentLines = module.exports;

var _ = require('lodash');
var t = require('../lib/t');
var numberformat = require('../lib/numberformat');
var bigdecimal = require('../lib/bigdecimal');
var $ = require('jquery');
var talk = require('../lib/talk');
var dateLib = require('../lib/date');
var browser = require('../browser');

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
Group.getGroupForLine = function(groups, lineId) {
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

Group.contains = function(groups, lineId) {
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

/**
 * Returns true if the line id has already been used (added to the specified list).
 * @param list The list to search
 * @param id The id to search for
 * @returns {boolean} true if the id has already been used
 */
var isUsed = function(list, id) {
	return !_.isUndefined(_.findWhere(list, { ID: id} ));
};

/**
 * Groups lines according to the specified matching info. If lines belong to the same matching failure they will be
 * grouped together. The order of the lines is determined by the order given from the document resource.
 * @param lines The lines to group
 * @param matchinfo The matching result from the matching resource
 * @returns {Array} The lines grouped
 */
var groupLines = function(lines, matchinfo) {
	// Create groups from matching info
	var groups = [];
	_.each(matchinfo.MatchingFailures, function(failure) {
		var group = new Group([], failure);
		group.Id = groups.length;
		groups.push(group);
		_.each(failure.LineId, function(lineId) {
			group.add(lineId);
		});
	});

	// Sorting assumes lines are sorted initially by Id

	// Loop through all lines in the document.
	// If the line has an error (failure), add the entire group,
	// else add the line as it is.

	var result = [];
	var usedLines = [];
	_.each(lines, function(line) {
		// If line has not been used yet
		if (!isUsed(usedLines, line.ID )) {
			if (Group.contains(groups, line.ID)) {
				// Add all lines in group
				var group = Group.getGroupForLine(groups, line.ID);
				result.push(group);
				_.each(group.members, function(id) {
					// Ignore already added line
					if (!isUsed(usedLines, id)) {
						// Find corresponding line
						var l = _.find(lines, function(item) {
							return item.ID === id;
						});
						if (!_.isUndefined(l)) {
							l.failure = group.failure;
							l.groupId = group.Id;
							group.lines.push(l);
							usedLines.push(l);
						}
					}
				});
			} else {
				usedLines.push(line);
				result.push(line);
			}
		}
	});

	return result;
};

/** Method to add 'ThresholdDeltaValue to failing fields,
 * denotes what's the max difference between invoiced total and the referenced PO value.
 * @param groups, the groups to which to add the threshold value.
**/
function addThresholdValues(groups) {
	_.forEach(groups, function(g){
		if(g.isGroup && g.isGroup()) {
			var fields = g.failure.Fields;
			_.forEach(fields, function (f) {
				if (_.contains(CALCULABLE_FIELDS, f.Type)) {
					var thresholdValue = bigdecimal.create(f.ThresholdValue);
					var baseValue = bigdecimal.create(f.BaseValue);
					f.ThresholdDeltaValue = thresholdValue.minus(baseValue).toString();
				}
			});
		}
	});
}

var compare = function(a, b) {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
};

var sortLines = function(matchinfo) {
	if (matchinfo.MatchingFailures) {
		_.each(matchinfo.MatchingFailures, function(failure) {
			if (failure.TargetAccumulation.Parts) {
				failure.TargetAccumulation.Parts.sort(function(a, b) {
					// Lines are sorted by DocumentTime then DocumentNumber
					if (a.DocumentTime !== b.DocumentTime) {
						return compare(a.DocumentTime, b.DocumentTime);
					}
					return compare(a.DocumentNumber, b.DocumentNumber);
				});
			}
		});
	}
};

viewDocumentLines.onscope = function (scope) {
	var initializeView = function(matchinfo) {
		sortLines(matchinfo);

		var fieldLabels = scope.viewProfile.fields.Lines;
		//Workaround for correspondence between backend that use 'Price' name as it specified in UBL
		//and view that use 'Price Unit' label.
		fieldLabels.Price = fieldLabels.UnitPrice;
		var unitLabels = scope.units;

		scope.fieldLabel = function (path) {
			if (!fieldLabels[path]) {
				return '';
			}
			return fieldLabels[path].label;
		};

		// Group lines
		var groups = groupLines(scope.lines, matchinfo);

		// Add threshold values for tolerances.
		addThresholdValues(groups);

		// Initialize error description messages
		_.each(groups, function(g) {
			if(g.isGroup && g.isGroup()){
				g.makeErrorDescription(fieldLabels, unitLabels);
			}
		});

		scope.groups = groups;
		scope.$safeDigest();

		// This is needed since Angular keeps posting events and there is no way to catch that Angular is
		// really done. So this will assure that flexbox is initialized on all DOM elements on the page.
		setTimeout(function() {
			$('body')[0].ownerDocument.defaultView.gui.reflex();
		}, 0);
	};

	talk.subscribe('ap-line-matching-groups', function (matchinfo) {
		if(!scope.groups) {
			initializeView(matchinfo);
		}
	});

	talk.subscribe('ap-line-matching-error', function (matchinfo) {
		if(!scope.groups) {
			initializeView(matchinfo);
		}
	});
};

/**
 * Controller for groups (line/s with matching error information)
 */
viewDocumentLines.groupController = function(scope) {
	var translations = {
		accordionActive: t('Hide details'),
		accordionInactive: t('Show details')
	},
	accordionOpen = false;

	scope.accordionState = translations.accordionInactive;

	scope.toggleAccordion = function() {
		accordionOpen = !accordionOpen;
		if (accordionOpen) {
			talk.broadcast('acc-open-discrepancy-view', scope.$parent.group.Id);
			scope.accordionState = translations.accordionActive;
		} else {
			talk.broadcast('acc-close-discrepancy-view', scope.$parent.group.Id);
			scope.accordionState = translations.accordionInactive;
		}
	};

	scope.isAccordionOpen = function() {
		return accordionOpen;
	};

	scope.dateFormatted = function (timestamp) {
		var date = new Date(timestamp);
		var string = dateLib.getDateString(date);
		return string;
	};

	scope.openDocument = function(l) {
		browser.navigate('/conversation/view/' + l.DocumentId);
	};
};

viewDocumentLines.lineController = function(scope) {
	scope.sign = function(number) {
		if	(number === undefined || number === null){
			return '';
		}

		if (number.length > 0) {
			return number.charAt(0) === '-' ? '-' : '+';
		}
		return '+';
	};

	scope.number = function(number) {
		if	(number === undefined || number === null){
			return '';
		}

		// Remove sign
		if (number.length > 0 && number.charAt(0) === '-') {
			return number.substring(1);
		}
		return number;
	};

	scope.type = function(type) {
		return t(type.replace('_', ' '));
	};
};
