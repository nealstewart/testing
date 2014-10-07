var viewDocumentLines = module.exports;

var _ = require('lodash');
var t = require('../lib/t');
var bigdecimal = require('../lib/bigdecimal');
var $ = require('jquery');
var talk = require('../lib/talk');
var dateLib = require('../lib/date');
var browser = require('../lib/browser');
var groupLib = require('./group');

var CALCULABLE_FIELDS = ['LineExtensionAmount', 'Quantity'];

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
		var group = group.create([], failure);
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
			if (groupLib.contains(groups, line.ID)) {
				// Add all lines in group
				var group = groupLib.getGroupForLine(groups, line.ID);
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
