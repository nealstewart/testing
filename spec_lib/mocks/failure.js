var failure = module.exports;

failure.create = function() {
	var f = {};

	f.Fields = {
		LineReferenceId: Math.floor(Math.random() * 1000000).toString()
	};

	return f;
};
