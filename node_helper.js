"use strict"

var NodeHelper = require("node_helper")
const exec = require("child_process").exec
var log = (...args) => { /* do nothing */ }

module.exports = NodeHelper.create({
  start: function () {

  },

  socketNotificationReceived: function (noti, payload) {
    switch (noti) {
      case "INIT":
        console.log("[MUSIC] EXT-MusicPlayer Version:", require('./package.json').version, "rev:", require('./package.json').rev)
        this.initialize(payload)
      break
    }
  },

  initialize: async function (config) {
    this.config = config
    if (this.config.debug) log = (...args) => { console.log("[MUSIC]", ...args) }
  }
})
