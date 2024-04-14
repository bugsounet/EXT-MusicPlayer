const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const USB = require("usb").usb;
const Drives = require("drivelist");

const VLC = require("vlc-client");

var log = function () { /*do nothing*/ };

class PLAYER {
  constructor (config, debug, callback = ()=>{}) {
    this.config= config;
    this.default = {
      useUSB: false,
      modulePath: "./",
      musicPath: "/home",
      checkSubDirectory: false,
      autoStart: false,
      maxVolume: 256,
      loop: false,
      random: false
    };
    this.config = Object.assign(this.default, this.config);
    this.sendSocketNotification = callback.sendSocketNotification;
    if (debug) log = (...args) => { console.log("[MUSIC]", ...args); };
    this.AutoDetectUSB= this.config.useUSB;
    this.FileExtensions = ["mp3","flac","wav", "ogg", "opus", "m4a"];
    this.MusicPlayerStatus = {
      readyToAutoPlay: false,
      justStarted: true,
      ready: false,
      connected: false,
      pause: false,
      current: 0,
      duration: 0,
      file: null,
      title: "",
      artist: "",
      volume: 0,
      date: 0,
      seed: 0,
      cover: null,
      id: 0,
      idMax: 0,
      format: null,
      lastState: false
    };
    this.audioList= [];
    this.USBAutoDetect();
    this.vlc = null;
    this.spawnCVLC();
    this.statusInterval = setInterval(() => this.status(), 1000);
  }

  async init () {
    // Re-init all value :)
    this.MusicPlayerStatus = {
      justStarted: true,
      ready: false,
      connected: false,
      pause: false,
      current: 0,
      file: null,
      title: "",
      artist: "",
      volume: 0,
      date: 0,
      seed: 0,
      cover: null,
      id: 0,
      idMax: 0,
      format: null,
      lastState: false
    };
    this.audioList= [];
  }

  async start () {
    if (this.AutoDetectUSB) { // USB Key is already connected !
      await this.USBSearchDrive();
    }
    else await this.search(this.config.musicPath);
    if (this.audioList.length) {
      console.log(`[MUSIC] Audio files Found: ${this.audioList.length}`);
      this.MusicPlayerStatus.readyToAutoPlay = true;
    } else console.log("[MUSIC] No Audio files Found!");
  }

  async USBSearchDrive () {
    let drives = await Drives.list();
    drives.forEach(async (drive) => {
      if (!drive.isSystem && drive.isUSB && drive.mountpoints[0]){
        log(`Found USB Drive: ${drive.description} in ${drive.device}`);
        var drive_path = path.normalize(drive.mountpoints[0].path);
        log(`USB Path Drive: ${drive_path}`);
        await this.search(drive_path);
      }
    });
  }

  USBAutoDetect () {
    log(`AutoDetect USB Key: ${this.AutoDetectUSB ? "On" : "Off"}`);
    if (this.AutoDetectUSB) {
      USB.on("attach", () => { this.PlugInUSB(); });
      USB.on("detach", () => { this.PlugOutUSB(); });
    }
  }

  PlugInUSB () {
    log("USB Key Detected");
    setTimeout(async () => {
      this.audioList= [];
      await this.USBSearchDrive();
      if (this.audioList.length) {
        console.log(`[MUSIC] Audio files Found: ${this.audioList.length}`);
        if (this.config.autoStart) this.MusicPlayList();
      } else console.log("[MUSIC] USB-KEY: No Audio files Found!");
    }, 5000);
  }

  PlugOutUSB () {
    log("Warn: USB Key Released!");
    this.destroyPlayer();
    this.init();
  }

  search (Path) {
    if (!fs.existsSync(Path)){
      console.log(`[MUSIC] Error: No such directory: ${Path}`);
      return;
    }
    log(`Search in ${Path}`);
    var FileList=fs.readdirSync(Path);
    FileList.forEach((file) => {
      var filename=path.join(Path,file);
      var stat = fs.lstatSync(filename);
      if (stat.isDirectory()){
        if (this.config.checkSubDirectory) this.search(filename);
      } else {
        var isValidFileExtension = this.checkValidFileExtension(filename);
        if (isValidFileExtension) {
          log(`Found: ${filename}`);
          this.audioList.push(filename);
        }
      }
    });
    this.MusicPlayerStatus.idMax = this.audioList.length-1;
  }

  checkValidFileExtension (filename) {
    var found = false;
    this.FileExtensions.forEach((extension) => {
      if (filename.toLowerCase().endsWith(extension)) found = true;
    });
    return found;
  }

  async MusicPlayList () {
    if (!this.audioList.length) {
      this.MusicPlayerStatus.idMax = 0;
      return console.log("[Music] No Music to Read");
    } else {
      this.MusicPlayerStatus.idMax = this.audioList.length-1;
    }

    if (!this.config.random) {
      if (this.MusicPlayerStatus.id === 0) {
        this.MusicPlayer();
      } else {
        this.MusicPlayerStatus.id++;
        if (this.MusicPlayerStatus.id > this.MusicPlayerStatus.idMax) this.MusicPlayerStatus.id = 0;
        else this.MusicPlayer();
      }
    } else this.MusicPlayer();
  }

  /** Music Player **/
  async MusicPlayer () {
    try {
      if (this.config.random) {
        let randomId = await this.getRandomInt(this.audioList.length);
        if (randomId === this.MusicPlayerStatus.id) return this.MusicPlayer (); // same song ?
        this.MusicPlayerStatus.id = randomId;
      }
      
      // make structure
      this.MusicPlayerStatus.connected = false;
      this.MusicPlayerStatus.current= 0;
      this.MusicPlayerStatus.file= this.audioList[this.MusicPlayerStatus.id];
      this.MusicPlayerStatus.seed = Date.now();
      this.MusicPlayerStatus.device= this.AutoDetectUSB ? "USB" : "FOLDER";

      log(`Start playing: ${path.basename(this.MusicPlayerStatus.file)}`);

      await this.vlc.playFile(this.MusicPlayerStatus.file, { novideo: true, wait: true, timeout: 300 });
      
      const fileMeta = await this.vlc.meta();
      this.MusicPlayerStatus.title= fileMeta.title ? fileMeta.title : path.basename(this.MusicPlayerStatus.file);
      this.MusicPlayerStatus.artist= fileMeta.artist ? fileMeta.artist: "-";
      this.MusicPlayerStatus.date= fileMeta.date ? fileMeta.date : "-";
      try {
        if (fileMeta.artwork_url) {
          let file = fileMeta.artwork_url.replace("file://", "");
          let fileName= path.basename(file);
          fs.copyFileSync(file, `${this.config.modulePath}/tmp/Music/${fileName}`);
          this.MusicPlayerStatus.cover = fileName;
        } else {
          this.MusicPlayerStatus.cover = null;
        }
      } catch (err) { 
        this.MusicPlayerStatus.cover = null;
      }
    } catch (error) {
      console.error("[MUSIC] Music Player Error:", error.message);
    }
  }

  send (data) {
    this.sendSocketNotification("Music_Player", data);
    //console.log("data", data)
  }

  getConnected () {
    return this.MusicPlayerStatus.connected;
  }

  setPause () {
    if (this.MusicPlayerStatus.ready) {
      if (this.MusicPlayerStatus.pause) {
        log("Resume Paused");
        this.vlc.play();
      } else {
        log("Paused");
        this.vlc.pause();
      }
    }
  }

  setPlay () {
    if (this.MusicPlayerStatus.ready) {
      if (this.MusicPlayerStatus.pause) {
        log("Resume Play");
        this.vlc.play();
      } else {
        log("Play");
        this.MusicPlayer();
        this.MusicPlayerStatus.pause= false;
      }
    }
  }

  setStop () {
    if (this.MusicPlayerStatus.ready) {
      log("Stop");
      this.vlc.stop();
      this.MusicPlayerStatus.lastState = false;
    }
  }

  setNext () {
    if (this.MusicPlayerStatus.ready) {
      if (this.config.random) this.MusicPlayer();
      else {
        log("Next");
        this.MusicPlayerStatus.id++;
        if (this.MusicPlayerStatus.id > this.MusicPlayerStatus.idMax) this.MusicPlayerStatus.id = 0;
        this.MusicPlayer();
      }
    }
  }

  setPrevious () {
    if (this.MusicPlayerStatus.ready) {
      if (this.config.random) this.MusicPlayer();
      else {
        log("Previous");
        this.MusicPlayerStatus.id--;
        if (this.MusicPlayerStatus.id < 0) this.MusicPlayerStatus.id = this.MusicPlayerStatus.idMax;
        this.MusicPlayer();
      }
    }
  }

  setVolume (volume) { // Warn must be 0-256
    if (this.MusicPlayerStatus.ready) {
      log(`Set Volume ${volume}`);
      this.vlc.setVolumeRaw(volume);
    }
  }

  setNewMax (volume) {
    if (volume) {
      // keep memoroy this volume for next song !
      log(`Received new Volume Max: ${volume}`);
      this.config.maxVolume = volume;
    }
  }

  setSwitch () {
    this.AutoDetectUSB = !this.AutoDetectUSB;
    this.rebuild();
  }

  rebuild () {
    log(`Rebuild Database with ${this.AutoDetectUSB ? "USB Key": "Local Folder"}`);
    this.setStop();
    this.init();
    this.start();
  }

  setRandom (random) {
    this.config.random = random;
    log(`Set Random to ${this.config.random}`);
  }

  getRandomInt (max) {
    return Math.floor(Math.random() * max);
  }

  /* create cvlc server */
  spawnCVLC () {
    const cvlcPassword = `EXT-MusicPlayer_v${require("../package.json").version}_${new Date(Date.now()).toISOString()}`;
    const args = [
      "-I http",
      "--extraintf",
      "http",
      "--http-port",
      8082,
      "--http-host",
      "localhost",
      "--http-password",
      cvlcPassword
    ];
    this.cvlcPlayer = spawn("cvlc",args);
    this.cvlcPlayer.on("error", (err) => {
      console.error("[MUSIC] [Server] Can't start CVLC Server! Reason:", err.message);
    });

    this.cvlcPlayer.on("close", (code) => {
      console.log(`[MUSIC] [Server] exited with code ${code}`);
    });

    this.vlc = new VLC.Client({
      ip: "localhost",
      port: 8082,
      password: cvlcPassword,
      log: this.config.debug
    });
  }

  async status () {
    if (!this.cvlcPlayer.pid) {
      log("[MUSIC] Server is not ready...");
      return;
    }
    const status = await this.vlc.status().catch(
      (err)=> {
        if (err.code === "ECONNREFUSED" || err.message.includes("Unauthorized")) {
          clearInterval(this.statusInterval);
          console.error("[MUSIC] Can't start CVLC Client! Reason:", err.message);
        } else console.error("[MUSIC]", err.message);
      }
    );

    if (status) this.MusicPlayerStatus.ready = true;
    else {
      this.MusicPlayerStatus.ready = false;
      return;
    }

    if (this.MusicPlayerStatus.justStarted) {
      this.MusicPlayerStatus.justStarted = false;
      this.setVolume(this.config.maxVolume);
      console.log("[MUSIC] Player Ready!");
    }

    if (this.MusicPlayerStatus.readyToAutoPlay) {
      this.MusicPlayerStatus.readyToAutoPlay = false;
      if (this.config.autoStart && this.AutoDetectUSB) this.MusicPlayList();
    }

    if (status.state === "stopped") { // to do better
      if (this.MusicPlayerStatus.lastState) {
        if ((this.MusicPlayerStatus.id >= this.MusicPlayerStatus.idMax) && !this.config.loop && !this.config.random) {
          /* end of playlist --> no loop */
          this.MusicPlayerStatus.id = 0;
          this.MusicPlayerStatus.connected = false;
          this.MusicPlayerStatus.lastState = false;
          this.send(this.MusicPlayerStatus);
          return;
        }
        this.setNext();
      } else {
        this.MusicPlayerStatus.connected = false;
        this.MusicPlayerStatus.lastState = false;
        this.send(this.MusicPlayerStatus);
      }
      return;
    }
    this.MusicPlayerStatus.connected = true;
    this.MusicPlayerStatus.lastState = true;
    this.MusicPlayerStatus.current = status.position;
    this.MusicPlayerStatus.volume = (parseInt(status.volume)*100)/256;
    this.MusicPlayerStatus.pause = status.state === "paused";
    if (this.MusicPlayerStatus.pause) {
      this.sendSocketNotification("Music_Player_PAUSE");
    }
    //console.log("--> status,", status)
    this.send(this.MusicPlayerStatus);
  }
}

module.exports = PLAYER;
