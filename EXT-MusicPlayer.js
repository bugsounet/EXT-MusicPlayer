/**
 ** Module : EXT-MusicPlayer
 ** @bugsounet
 ** ©01-2022
 ** support: http://forum.bugsounet.fr
 **/

logMUSIC = (...args) => { /* do nothing */ }

// @todo:
//  * define incoming noti for control with `MusicCommand()`
//  * define output noti for inform EXT-Gateway

Module.register("EXT-MusicPlayer", {
  defaults: {
    debug: true,
    useUSB: false,
    musicPath: "/home/pi/Music",
    checkSubDirectory: false,
    autoStart: true, // for testing ... don't forget to make in `false` for release !
    minVolume: 30,
    maxVolume: 100,
    NPMCheck: {
      useChecker: true,
      delay: 10 * 60 * 1000,
      useAlert: true
    }
  },

  start: function () {
    this.config.useMusic = true
    if (this.config.debug) logMUSIC = (...args) => { console.log("[MUSIC]", ...args) }
    this.Music = new Music(this.config, (noti,params) => console.log("[MUSIC]", noti, params), this.config.debug)
    this.initializeMusicVolumeVLC()
    this.musicConnected= false
  },

  getScripts: function() {
    return [
      "/modules/EXT-MusicPlayer/components/musicplayer.js",
      "https://cdn.materialdesignicons.com/5.2.45/css/materialdesignicons.min.css",
    ]
  },

  getStyles: function () {
    return [
      "EXT-MusicPlayer.css",
      "https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"
    ]
  },

  getDom: function() {
    return this.Music.prepare()
  },

  notificationReceived: function(noti, payload) {
    switch(noti) {
      case "DOM_OBJECTS_CREATED":
        this.sendSocketNotification("INIT", this.config)
        this.sendNotification("EXT_HELLO", this.name)
        break
    }
  },

  socketNotificationReceived: function(noti, payload) {
    switch(noti) {
      /** Music Player **/
      case "Music_Player":
        if (payload.connected) {
          this.musicConnected = true
          if (!payload.pause) this.Music.setPlay()
        } else {
          this.musicConnected = false
        }
        this.Music.updateSongInfo(payload)
        break
      case "Music_Player_PAUSE":
        this.Music.setPause()
        break
    }
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
  },

  /****************************/
  /*** TelegramBot Commands ***/
  /****************************/
  getCommands: function(commander) {
    commander.add({
      command: "music",
      description: "Music player commands",
      callback: "tbMusic"
    })
  },

  tbMusic: function(command, handler) {
    if (handler.args) {
      var args = handler.args.toLowerCase().split(" ")
      var params = handler.args.split(" ")
      if (args[0] == "play") {
        handler.reply("TEXT", "Music PLAY")
        this.MusicCommand("PLAY")
      }
      if (args[0] == "pause") {
        handler.reply("TEXT", "Music PAUSE")
        this.MusicCommand("PAUSE")
      }
      if (args[0] == "stop") {
        handler.reply("TEXT", "Music STOP")
        this.MusicCommand("STOP")
      }
      if (args[0] == "next") {
        handler.reply("TEXT", "Music NEXT")
        this.MusicCommand("NEXT")
      }
      if (args[0] == "previous") {
        handler.reply("TEXT", "Music PREVIOUS")
        this.MusicCommand("PREVIOUS")
      }
      if (args[0] == "rebuild") {
        handler.reply("TEXT", "Rebuild music database")
        this.MusicCommand("REBUILD")
      }
      if (args[0] == "volume") {
        if (args[1]) {
          if (isNaN(args[1])) return handler.reply("TEXT", "Must be a number ! [0-100]")
          if (args[1] > 100) args[1] = 100
          if (args[1] < 0) args[1] = 0
          handler.reply("TEXT", "Music VOLUME: " + args[1])
          /* 100 -> 256
           * args[1] -> y
           */
          this.MusicCommand("VOLUME", parseInt(((args[1]*256)/100).toFixed(0)), true)
        } else handler.reply("TEXT", "Define volume [0-100]")
      }
      if (args[0] == "switch") {
        handler.reply("TEXT", "Switch Database (USB Key/Local Folder)")
        this.MusicCommand("SWITCH")
      }
    } else {
      handler.reply("TEXT", 'Need Help for /music commands ?\n\n\
  *play*: Launch music (last title)\n\
  *pause*: Pause music\n\
  *stop*: Stop music\n\
  *next*: Next track\n\
  *previous*: Previous track\n\
  *rebuild*: Rebuild music Database\n\
  *volume*: Volume control, it need a value 0-100\n\
  *switch*: Switch between USB Key and Local Folder\n\
  ',{parse_mode:'Markdown'})
    }
  },

  /** Music commands/controls **/
  MusicCommand: function(command, payload, realValue) {
    switch (command) {
      case "PLAY":
        this.sendSocketNotification("MUSIC_PLAY")
        break
      case "PAUSE":
        this.sendSocketNotification("MUSIC_PAUSE")
        break
      case "STOP":
        this.sendSocketNotification("MUSIC_STOP")
        break
      case "NEXT":
        this.sendSocketNotification("MUSIC_NEXT")
        break
      case "PREVIOUS":
        this.sendSocketNotification("MUSIC_PREVIOUS")
        break
      case "VOLUME":
        if (!realValue) {
          var volumeValue = payload
          if (isNaN(volumeValue)) return console.log("ERROR MUSIC VOLUME", "Must be a number ! [0-100]", volumeValue)
          if (payload > 100) volumeValue = 100
          if (payload < 0) volumeValue = 0
          volumeValue= parseInt(((volumeValue*256)/100).toFixed(0))
        }
        this.config.maxVolume = realValue ? payload: volumeValue
        this.sendSocketNotification("MUSIC_VOLUME_TARGET", realValue ? payload: volumeValue)
        break
      case "REBUILD":
        this.sendSocketNotification("MUSIC_REBUILD")
        break
      case "SWITCH":
        this.sendSocketNotification("MUSIC_SWITCH")
        break
    }
  }
})
