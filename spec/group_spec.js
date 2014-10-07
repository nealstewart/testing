var groupLib = require('../src/group');
var mockFailure = require('../spec_lib/mocks/failure');

describe('group', function() {
	it('can be created', function() {
		groupLib.create([], mockFailure.create());
	});

	describe('constructor', function() {
		beforeEach(function() {
			this.members = [];
			this.failure = mockFailure.create();
			this.group = groupLib.create(this.members, this.failure);
		});

		it('has members property', function() {
			expect(this.group.members).toEqual(this.members);
		});

		it('has lines', function() {
			expect(this.group.lines).toEqual([]);
		});

		it('has failure descriptions', function() {
			expect(this.group.failureDescriptions).toEqual([]);
		});

		it('has the mock failure', function() {
			expect(this.group.failure).toEqual(this.mockFailure);
		});
	});
});
