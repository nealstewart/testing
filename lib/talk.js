var talk = module.exports;

var EventEmitter = require('events');

var events = new EventEmitter();

talk.subscribe = events.on.bind(events);
talk.unsubscribe = events.off.bind(events);
talk.broadcast = events.emit.bind(events);
