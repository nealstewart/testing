var viewDocumentLines = require('../src/view_document_lines');

var talk = require('../lib/talk');

function MockScope() {
}

describe('viewDocumentLines', function() {

	describe('controller', function() {
		beforeEach(function() {
			this.mockScope = new MockScope();

			spyOn(talk, 'subscribe').andCallThrough();
			spyOn(talk, 'broadcast').andCallThrough();

			viewDocumentLines.onscope(this.mockScope);
		});

		afterEach(function() {
			talk.unsubscribeAll();
		});

		it('subscribes to talk', function() {
			expect(talk.subscribe).toHaveBeenCalledWith(
				'ap-line-matching-groups',
				jasmine.any(Function)
			);

			expect(talk.subscribe).toHaveBeenCalledWith(
				'ap-line-matching-error',
				jasmine.any(Function)
			);
		});

		it('initializes the view when a broadcast occurs', function() {
		});
	});
});
