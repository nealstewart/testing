var talk = module.exports;

var EventEmitter = require('events').EventEmitter;

var events = new EventEmitter();

talk.subscribe = events.on.bind(events);
talk.unsubscribe = events.removeListener.bind(events);
talk.broadcast = events.emit.bind(events);
