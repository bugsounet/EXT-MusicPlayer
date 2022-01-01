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
    useUSB: false,
    musicPath: "/home/pi/Music",
    checkSubDirectory: false,
    autoStart: false,
    minVolume: 30,
    maxVolume: 100
  },

  start: function () {
    if (this.config.debug) logMUSIC = (...args) => { console.log("[MUSIC]", ...args) }
    this.Music = new Music(this.config, (noti,params) => console.log("[MUSIC]", noti, params), this.config.debug)
    this.initializeMusicVolumeVLC()
  },

  getScripts: function() {
    return [
      "/modules/EXT-MusicPlayer/components/musicplayer.js"
    ]
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
    
  },

  /** initialise Music volume control for VLC **/
  initializeMusicVolumeVLC: function() {
    /** convert volume **/
    try {
      let valueMin = null
      valueMin = parseInt(this.config.minVolume)
      if (typeof valueMin === "number" && valueMin >= 0 && valueMin <= 100) this.config.minVolume = ((valueMin * 255) / 100).toFixed(0)
      else {
        console.error("[MUSIC] config.music.minVolume error! Corrected with 30")
        this.config.minVolume = 70
      }
    } catch (e) {
      console.error("[MUSIC] config.music.minVolume error!", e)
      this.config.minVolume = 70
    }
    try {
      let valueMax = null
      valueMax = parseInt(this.config.maxVolume)
      if (typeof valueMax === "number" && valueMax >= 0 && valueMax <= 100) this.config.maxVolume = ((valueMax * 255) / 100).toFixed(0)
      else {
        console.error("[MUSIC] config.music.maxVolume error! Corrected with 100")
        this.config.maxVolume = 255
      }
    } catch (e) {
      console.error("[MUSIC] config.music.maxVolume error!", e)
      this.config.maxVolume = 255
    }
    console.log("[MUSIC] VLC Volume Control initialized!")
  }
})
