/**
 ** Module : EXT-MusicPlayer
 ** @bugsounet
 ** ©01-2022
 ** support: http://forum.bugsounet.fr
 **/

logMUSIC = (...args) => { /* do nothing */ }

Module.register("EXT-MusicPlayer", {
  defaults: {
    debug: true,
  },

  start: function () {
    if (this.config.debug) logMUSIC = (...args) => { console.log("[MUSIC]", ...args) }
  },

  getScripts: function() {
    return [ ]
  },

  getStyles: function () {
    return [
      "EXT-MusicPlayer.css",
      "https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"
    ]
  },

  getDom: function() {
    var dom = document.createElement("div")
    dom.style.display = 'none'
    return dom
  },

  notificationReceived: function(noti, payload) {
    switch(noti) {
      case "DOM_OBJECTS_CREATED":
        this.sendSocketNotification("INIT", this.config)
        break
    }
  },

  socketNotificationReceived: function(noti, payload) {
    
  }
})
