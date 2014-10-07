var service = require('../src/service');

describe('service', function() {
	var TEST_DATA = {
		my: 'data',
		is: 'cool',
		num: Math.random()
	};
	beforeEach(function() {
		this.mockPromise = {};

		spyOn(service, '_request').andReturn(this.mockPromise);

		this.service = service.create(TEST_DATA);
	});

	it('returns the promise from request', function() {
		var ret = this.service.save();
		expect(ret).toBe(this.mockPromise);
	});

	it('requests properly', function() {
		var ret = this.service.save();
		expect(service._request).toHaveBeenCalledWith({
			url: jasmine.any(String),
			type: 'POST',
			json: TEST_DATA
		});
	});
});
