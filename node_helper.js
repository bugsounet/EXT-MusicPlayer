"use strict"

var NodeHelper = require("node_helper")
const exec = require("child_process").exec
var log = (...args) => { /* do nothing */ }

module.exports = NodeHelper.create({
  start: function () {
    this.Lib= {}
  },

  socketNotificationReceived: function (noti, payload) {
    switch (noti) {
      case "INIT":
        console.log("[MUSIC] EXT-MusicPlayer Version:", require('./package.json').version, "rev:", require('./package.json').rev)
        this.initialize(payload)
      break
      /** Music module **/
      case "MUSIC_PLAY":
        this.PlayMusic()
        break
      case "MUSIC_STOP":
        this.StopMusic()
        break
      case "MUSIC_PAUSE":
        this.PauseMusic()
        break
      case "MUSIC_NEXT":
        this.NextMusic()
        break
      case "MUSIC_PREVIOUS":
        this.PreviousMusic()
        break
      case "MUSIC_VOLUME_TARGET":
        this.config.maxVolume = payload // informe helper
        this.VolumeNewMax(payload)
      case "MUSIC_VOLUME":
        this.VolumeMusic(payload)
        break
      case 'MUSIC_REBUILD':
        this.RebuildMusic()
        break
      case 'MUSIC_SWITCH':
        this.SwitchMusic()
        break
    }
  },

  initialize: async function (config) {
    this.config = config
    this.config.modulePath = __dirname
    if (this.config.debug) log = (...args) => { console.log("[MUSIC]", ...args) }
    let bugsounet = await this.loadBugsounetLibrary()
    if (bugsounet) {
      console.error("[MUSIC] Warning:", bugsounet, "@bugsounet library not loaded !")
      console.error("[MUSIC] Try to solve it with `npm run rebuild` in EXT-MusicPlayer directory")
      return
    }
    else {
      console.log("[MUSIC] All needed @bugsounet library loaded !")
    }
    log("Starting Music module...")
    try {
      var callbacks= {
        "sendSocketNotification": (noti, params) => {
          if (this.config.verbose) log(noti,params)
          this.sendSocketNotification(noti, params)
        }
      }
      this.music = new this.Lib.MusicPlayer(this.config, this.config.debug, callbacks)
      this.music.start()
    } catch (e) { console.log("[MUSIC]", e) } // testing
  },

  /** Load require @busgounet library **/
  /** It will not crash MM (black screen) **/
  loadBugsounetLibrary: function() {
    let libraries= [
      // { "library to load" : [ "store library name", "path to check", needed without EXT ?] }
      { "@bugsounet/cvlcmusicplayer": ["MusicPlayer", "useMusic" ] },
    ]
    let errors = 0
    return new Promise(resolve => {
      libraries.forEach(library => {
        for (const [name, configValues] of Object.entries(library)) {
          let libraryToLoad = name,
              libraryName = configValues[0],
              libraryPath = configValues[1],
              index = (obj,i) => { return obj[i] }

          // libraryActivate: verify if the needed path of config is activated (result of reading config value: true/false) **/
          let libraryActivate = libraryPath.split(".").reduce(index,this.config) 
          if (libraryActivate) {
            try {
              if (!this.Lib[libraryName]) {
                this.Lib[libraryName] = require(libraryToLoad)
                log("Loaded " + libraryToLoad)
              }
            } catch (e) {
              console.error("[MUSIC]", libraryToLoad, "Loading error!" , e)
              this.sendSocketNotification("WARNING" , {message: "LibraryError", values: libraryToLoad })
              errors++
            }
          }
        }
      })
      resolve(errors)
    })
  },

 /** Send function to @bugsounet/cvlcmusicplayer library **/
  StopMusic: function() {
    if (this.music) {
      this.music.setStop()
    }
  },

  PlayMusic: function () {
    this.music.setPlay()
  },

  PauseMusic: function() {
    if (this.music) {
      this.music.setPause()
    }
  },

  PreviousMusic: function() {
    if (this.music) {
      this.music.setPrevious()
    }
  },

  NextMusic: function() {
    if (this.music) {
      this.music.setNext()
    }
  },

  VolumeNewMax: function (max) {
    this.music.setNewMax(this.config.maxVolume)
  },

  VolumeMusic: function(volume) {
    if (this.music) {
      this.music.setVolume(volume)
    }
  },

  RebuildMusic: function() {
    this.music.rebuild()
  },

  SwitchMusic: function() {
    this.music.setSwitch()
  }
})
