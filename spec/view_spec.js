var viewDocumentLines = require('../src/view_document_lines');

describe('viewDocumentLines', function() {
	function MockScope() {
	}
	describe('controller', function() {
		beforeEach(function() {
			this.mockScope = new MockScope();

			viewDocumentLines.onscope(this.mockScope);
		});

		it('does something', function() {
		});
	});
});
