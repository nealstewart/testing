var service = module.exports;

var request = require('request-promise');

var URL = 'http://example.com/my/path';

function Service(data) {
	this.data = data;
}

Service.prototype.save = function() {
	return service._request({
		url: URL,
		type: 'POST',
		json: this.data
	});
};

service.create = function(data) {
	return new Service(data);
};

service._request = request;
