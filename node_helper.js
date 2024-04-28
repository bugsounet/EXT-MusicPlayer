"use strict";

const exec = require("child_process").exec;
var NodeHelper = require("node_helper");

var log = (...args) => { /* do nothing */ };

module.exports = NodeHelper.create({
  start () {
    this.Lib= {};
  },

  socketNotificationReceived (noti, payload) {
    switch (noti) {
      case "INIT":
        console.log("[MUSIC] EXT-MusicPlayer Version:", require("./package.json").version, "rev:", require("./package.json").rev);
        this.initialize(payload);
        break;
      case "START":
        this.StartMusic();
        break;
      /** Music module **/
      case "MUSIC_PLAY":
        this.PlayMusic(payload);
        break;
      case "MUSIC_STOP":
        this.StopMusic();
        break;
      case "MUSIC_PAUSE":
        this.PauseMusic();
        break;
      case "MUSIC_NEXT":
        this.NextMusic();
        break;
      case "MUSIC_PREVIOUS":
        this.PreviousMusic();
        break;
      case "MUSIC_VOLUME_TARGET":
        this.config.maxVolume = payload; // informe helper
        this.VolumeNewMax(payload);
      case "MUSIC_VOLUME":
        this.VolumeMusic(payload);
        break;
      case "MUSIC_REBUILD":
        this.RebuildMusic();
        break;
      case "MUSIC_SWITCH":
        this.SwitchMusic();
        break;
      case "MUSIC_RANDOM":
        this.music.setRandom(payload);
        break;
    }
  },

  async initialize (config) {
    this.config = config;
    this.config.modulePath = __dirname;
    if (this.config.debug) log = (...args) => { console.log("[MUSIC]", ...args); };
    let bugsounet = await this.loadBugsounetLibrary();
    if (bugsounet) {
      console.error("[MUSIC] Warning:", bugsounet, "@bugsounet library not loaded !");
      console.error("[MUSIC] Try to solve it with `npm run rebuild` in EXT-MusicPlayer directory");
      return;
    }
    console.log("[MUSIC] All needed @bugsounet library loaded !");
  },

  /** Load require @busgounet library **/
  /** It will not crash MM (black screen) **/
  loadBugsounetLibrary () {
    let libraries= [
      { "./components/playerLib.js": "MusicPlayer" }
    ];
    let errors = 0;
    return new Promise((resolve) => {
      libraries.forEach((library) => {
        for (const [name, configValues] of Object.entries(library)) {
          let libraryToLoad = name;
          let libraryName = configValues;

          try {
            if (!this.Lib[libraryName]) {
              this.Lib[libraryName] = require(libraryToLoad);
              log(`Loaded ${libraryToLoad}`);
            }
          } catch (e) {
            console.error("[MUSIC]", libraryToLoad, "Loading error!" , e);
            this.sendSocketNotification("WARNING" , { message: "LibraryError", values: libraryToLoad });
            errors++;
          }
        }
      });
      resolve(errors);
    });
  },

  /* Start and Init Music Player **/
  StartMusic() {
    log("Starting Music module...");
    try {
      var callbacks= {
        sendSocketNotification: (noti, params) => {
          if (this.config.verbose) log(noti,params);
          this.sendSocketNotification(noti, params);
        }
      };
      this.music = new this.Lib.MusicPlayer(this.config, this.config.debug, callbacks);
      this.music.start();
    } catch (e) { console.log("[MUSIC]", e); } // testing
  },

  /** Send function to @bugsounet/cvlcmusicplayer library **/
  StopMusic () {
    if (this.music) {
      this.music.setStop();
    }
  },

  PlayMusic (id) {
    this.music.setPlay(id);
  },

  PauseMusic () {
    if (this.music) {
      this.music.setPause();
    }
  },

  PreviousMusic () {
    if (this.music) {
      this.music.setPrevious();
    }
  },

  NextMusic () {
    if (this.music) {
      this.music.setNext();
    }
  },

  VolumeNewMax (max) {
    this.music.setNewMax(this.config.maxVolume);
  },

  VolumeMusic (volume) {
    if (this.music) {
      this.music.setVolume(volume);
    }
  },

  RebuildMusic () {
    this.music.rebuild();
  },

  SwitchMusic () {
    this.music.setSwitch();
  }
});
