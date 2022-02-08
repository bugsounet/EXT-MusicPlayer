/**
 ** Module : EXT-MusicPlayer
 ** @bugsounet
 ** ©01-2022
 ** support: http://forum.bugsounet.fr
 **/

logMUSIC = (...args) => { /* do nothing */ }

Module.register("EXT-MusicPlayer", {
  defaults: {
    debug: false,
    verbose: false,
    useUSB: false,
    musicPath: "/home/pi/Music",
    checkSubDirectory: false,
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
    this.initializeMusicVolumeVLC()
    this.music= {
      connected: false,
      currentVolume: 0,
      minVolume: this.config.minVolume,
      minValue: this.convertPercentToValue(this.config.minVolume),
      maxVolume: this.config.maxVolume,
      targetVolume: this.config.maxVolume,
      targetValue: this.convertPercentToValue(this.config.maxVolume),
      assistantSpeak: false
    }
    this.config.minVolume = this.music.minValue
    this.config.maxVolume = this.music.targetValue
    this.Music = new Music(this.config, (noti,params) => console.log("[MUSIC NOTI]", noti, params), this.config.debug)
  },

  getScripts: function() {
    return [
      "/modules/EXT-MusicPlayer/components/musicplayer.js",
      "https://code.iconify.design/1/1.0.6/iconify.min.js"
    ]
  },

  getStyles: function () {
    return [
      "EXT-MusicPlayer.css",
      "https://cdn.materialdesignicons.com/5.2.45/css/materialdesignicons.min.css",
      "https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css"
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
      case "ASSISTANT_LISTEN":
      case "ASSISTANT_THINK":
      case "ASSISTANT_REPLY":
      case "ASSISTANT_CONTINUE":
      case "ASSISTANT_CONFIRMATION":
      case "ASSISTANT_ERROR":
        this.music.assistantSpeak= true
        break
      case "ASSISTANT_HOOK":
      case "ASSISTANT_STANDBY":
        this.music.assistantSpeak= false
        break
      case "EXT_STOP":
      case "EXT_MUSIC-STOP":
        this.MusicCommand("STOP")
        break
      case "EXT_MUSIC-VOLUME_MIN":
        if (!this.music.connected) return
        if (this.music.currentVolume <= this.music.minVolume) return
        this.music.targetVolume = this.music.currentVolume
        this.music.targetValue = this.convertPercentToValue(this.music.targetVolume)
        this.MusicCommand("VOLUME", this.music.minValue)
        break
      case "EXT_MUSIC-VOLUME_MAX":
        if (!this.music.connected) return
        if (this.music.targetVolume <= this.music.minVolume) return
        this.MusicCommand("VOLUME", this.music.targetValue)
        break
      case "EXT_MUSIC-VOLUME_SET":
        if (isNaN(payload)) return console.log("ERROR MUSIC VOLUME", "Must be a number ! [0-100]", payload)
        if (payload > 100) payload = 100
        if (payload < 0) payload = 0
        this.music.targetValue = this.convertPercentToValue(payload)
        this.music.targetVolume = payload
        if (!this.music.assistantSpeak) this.MusicCommand("VOLUME", this.music.targetValue)
        break
      case "EXT_MUSIC-NEXT":
        this.MusicCommand("NEXT")
        break
      case "EXT_MUSIC-PREVIOUS":
        this.MusicCommand("PREVIOUS")
        break
      case "EXT_MUSIC-REBUILD":
        this.MusicCommand("REBUILD")
        break
      case "EXT_MUSIC-SWITCH":
        this.MusicCommand("SWITCH")
        break
      case "EXT_MUSIC-PLAY":
        this.MusicCommand("PLAY")
        break
      case "EXT_MUSIC-PAUSE":
        this.MusicCommand("PAUSE")
        break
    }
  },

  socketNotificationReceived: function(noti, payload) {
    switch(noti) {
      /** Music Player **/
      case "Music_Player":
        if (payload.volume) this.music.currentVolume = payload.volume
        if (payload.connected) {
          if (!this.music.connected) {
            this.music.connected = true
            this.sendNotification("EXT_MUSIC-CONNECTED")
          }
          if (!payload.pause) this.Music.setPlay()
        } else {
          if (this.music.connected) {
            this.music.connected = false
            this.sendNotification("EXT_MUSIC-DISCONNECTED")
          }
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
      if (typeof valueMin === "number" && valueMin < 0 && valueMin > 100) {
        console.error("[MUSIC] config.minVolume error! Corrected with 30")
        this.config.minVolume = 30
      }
    } catch (e) {
      console.error("[MUSIC] config.minVolume error!", e)
      this.config.minVolume = 30
    }
    try {
      let valueMax = null
      valueMax = parseInt(this.config.maxVolume)
      if (typeof valueMax === "number" && valueMax < 0 && valueMax > 100) {
        console.error("[MUSIC] config.maxVolume error! Corrected with 100")
        this.config.maxVolume = 100
      }
    } catch (e) {
      console.error("[MUSIC] config.maxVolume error!", e)
      this.config.maxVolume = 100
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
          this.MusicCommand("VOLUME", this.convertPercentToValue(args[1]))
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
        this.sendSocketNotification("MUSIC_VOLUME_TARGET", payload)
        break
      case "REBUILD":
        this.sendSocketNotification("MUSIC_REBUILD")
        break
      case "SWITCH":
        this.sendSocketNotification("MUSIC_SWITCH")
        break
    }
  },

  /** Convert percent to cvlc value **/
  convertPercentToValue: function(percent) {
    return parseInt(((percent*256)/100).toFixed(0))
  }
})
