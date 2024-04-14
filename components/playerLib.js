const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require('node:child_process');
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
      maxVolume: 256
    };
    this.config = Object.assign(this.default, this.config);
    this.sendSocketNotification = callback.sendSocketNotification;
    if (debug) log = (...args) => { console.log("[MUSIC]", ...args); };
    this.meta = null;
    this.forceStop = false;
    this.EndWithNoCb = false;
    this.AutoDetectUSB= false;
    this.FileExtensions = ["mp3","flac","wav", "ogg", "opus", "m4a"];
    this.MusicPlayerStatus = {
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
      format: null
    };
    this.audioList= [];
    if (this.config.useUSB) this.AutoDetectUSB= true;
    this.USBAutoDetect();
    this.cvlcPassword = `EXT-MusicPlayer_v${require("../package.json").version}_${new Date(Date.now()).toISOString()}`
    this.vlc = new VLC.Client({
      ip: "localhost",
      port: 8082,
      password: this.cvlcPassword,
      log: debug
    });
    console.log("--->", this.vlc)
    this.spawnCVLC()
  }

  async init () {
    // Re-init all value :)
    this.MusicPlayerStatus = {
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
      format: null
    };
    this.audioList= [];
  }

  async start () {
    if (this.AutoDetectUSB) { // USB Key is already connected !
      await this.USBSearchDrive();
    }
    else await this.search(this.config.musicPath);
    if (this.audioList.length) {
      console.log("[MUSIC] Audio files Found:", this.audioList.length);
      if (this.config.autoStart && this.AutoDetectUSB) this.MusicPlayList();
    } else console.log("[MUSIC] No Audio files Found!");
  }

  async USBSearchDrive () {
    let drives = await Drives.list();
    drives.forEach(async (drive) => {
      if (!drive.isSystem && drive.isUSB && drive.mountpoints[0]){
        log("Found USB Drive:", drive.description , "in", drive.device);
        var drive_path = path.normalize(drive.mountpoints[0].path);
        log("USB Path Drive:", drive_path);
        await this.search(drive_path);
      }
    });
  }

  USBAutoDetect () {
    log("AutoDetect USB Key:" , this.AutoDetectUSB ? "On" : "Off");
    USB.on("attach", () => { this.PlugInUSB(); });
    USB.on("detach", () => { this.PlugOutUSB(); });
  }

  PlugInUSB () {
    if (!this.AutoDetectUSB) return;
    log("USB Key Detected");
    setTimeout(async () => {
      this.audioList= [];
      await this.USBSearchDrive();
      if (this.audioList.length) {
        console.log("[MUSIC] Audio files Found:", this.audioList.length);
        if (this.config.autoStart) this.MusicPlayList();
      } else console.log("[MUSIC] USB-KEY: No Audio files Found!");
    }, 5000);
  }

  PlugOutUSB () {
    if (!this.AutoDetectUSB) return;
    log("Warn: USB Key Released!");
    this.destroyPlayer();
    this.init();
  }

  search (Path) {
    if (!fs.existsSync(Path)){
      console.log("[MUSIC] Error: No such directory",Path);
      return;
    }
    log("Search in", Path);
    var FileList=fs.readdirSync(Path);
    FileList.forEach((file) => {
      var filename=path.join(Path,file);
      var stat = fs.lstatSync(filename);
      if (stat.isDirectory()){
        if (this.config.checkSubDirectory) this.search(filename);
      } else {
        var isValidFileExtension = this.checkValidFileExtension(filename);
        if (isValidFileExtension) {
          log("Found:", filename);
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
      this.MusicPlayerStatus.duration= 300 //parseInt((metadata.format.duration).toFixed(0));
      this.MusicPlayerStatus.file= this.audioList[this.MusicPlayerStatus.id];
      this.MusicPlayerStatus.seed = Date.now();
      this.MusicPlayerStatus.device= this.AutoDetectUSB ? "USB" : "FOLDER";

      log("Start playing:", path.basename(this.MusicPlayerStatus.file));
      await this.vlc.playFile(this.MusicPlayerStatus.file, { novideo: true, wait: true, timeout: 300})
      
      const fileMeta = await this.vlc.meta()
      console.log("fileMeta", fileMeta)
      this.MusicPlayerStatus.title= fileMeta.title ? fileMeta.title : path.basename(this.MusicPlayerStatus.file);
      this.MusicPlayerStatus.artist= fileMeta.artist ? fileMeta.artist: "-";
      this.MusicPlayerStatus.date= fileMeta.date ? fileMeta.date : "-";
      try {
        if (fileMeta.artwork_url) {
          let file = fileMeta.artwork_url.replace("file://", "")
          let fileName= path.basename(file);
          fs.copyFileSync(file, `${this.config.modulePath}/tmp/Music/${fileName}`)
          this.MusicPlayerStatus.cover = fileName;
        } else {
          this.MusicPlayerStatus.cover = null;
        }
      } catch (err) { 
        console.log("--->",err);
        his.MusicPlayerStatus.cover = null;
      }
      
      console.log(this.MusicPlayerStatus)
      //console.log(this.audioList)
      /*
      var cvlcArgs = ["--play-and-exit"];
      this.Music = new cvlc(cvlcArgs);
      this.Music.play(
        this.MusicPlayerStatus.file,
        ()=> {
          this.MusicPlayerStatus.connected = true;
          log("Start playing:", path.basename(this.MusicPlayerStatus.file));
          this.Music.cmd(`volume ${this.config.maxVolume}`);
          this.MusicPlayerStatus.pause = false;
          this.realTimeInfo();
        },
        ()=> {
          log("Music is now ended !");
          if ((this.MusicPlayerStatus.id >= this.MusicPlayerStatus.idMax) || this.MusicPlayerStatus.id === null) {
            this.MusicPlayerStatus.connected = false;
            this.send(this.MusicPlayerStatus);
          }
          if (this.EndWithNoCb) {
            this.EndWithNoCb = false;
            return;
          }
          if (this.forceStop) {
            this.forceStop = false;
            this.MusicPlayerStatus.connected = false;
            this.send(this.MusicPlayerStatus);
            return;
          }
          this.MusicPlayList();
        }
      );
      */
    } catch (error) {
      console.error("[MUSIC] Music Player Error:", error.message);
      if ((this.MusicPlayerStatus.id >= this.MusicPlayerStatus.idMax) || this.MusicPlayerStatus.id === null) {
        this.MusicPlayerStatus.connected = false;
        this.send(this.MusicPlayerStatus);
      }
      this.MusicPlayList();
    }
  }

/*
  realTimeInfo () {
    this.MusicInterval = setInterval(() => {
      this.Music.cmd("get_time", (err, response) => {
        this.MusicPlayerStatus.current= (parseInt(response)+1);
        this.Music.cmd("volume", (err,res) => {
          this.MusicPlayerStatus.volume= (parseInt(res)*100)/256;
        });
        this.send(this.MusicPlayerStatus);
      });
    }, 1000);
  }
*/

  send (data) {
    this.sendSocketNotification("Music_Player", data);
  }

  destroyPlayer () {
    if (this.Music) {
      this.Music.destroy();
      log("Boom! Cvlc Player Destroyed!");
    }
  }

  getConnected () {
    return this.MusicPlayerStatus.connected;
  }

  setPause () {
    if (this.Music) {
      this.Music.cmd("pause");
      log("Paused");
      this.MusicPlayerStatus.pause= !this.MusicPlayerStatus.pause;
      this.sendSocketNotification("Music_Player_PAUSE");
    }
  }

  setPlay () {
    this.MusicPlayer();
    this.MusicPlayerStatus.pause= false;
    log("Play");
  }

  setStop () {
    this.forceStop = true;
    this.destroyPlayer();
    log("Stop");
  }

  setNext () {
    if (this.cvlcPlayer) {
      if (this.config.random) this.MusicPlayer();
      else {
        this.MusicPlayerStatus.id++;
        if (this.MusicPlayerStatus.id > this.MusicPlayerStatus.idMax) this.MusicPlayerStatus.id = 0;
        this.MusicPlayer()
        log("Next");
      }
    }
  }

  setPrevious () {
    if (this.cvlcPlayer) {
      if (!this.config.random) {
        this.MusicPlayerStatus.id--;
        if (this.MusicPlayerStatus.id < 0) this.MusicPlayerStatus.id = 0;
      }
      this.MusicPlayer();
      log("Previous");
    }
  }

  setVolume (volume) { // Warn must be 0-256
    if (this.Music) {
      this.Music.cmd(`volume ${volume}`);
      log("Volume", volume);
    }
  }

  setNewMax (volume) {
    if (volume) {
      log("Received new Volume Max:" , volume); // keep memoroy this volume for next song !
      this.config.maxVolume = volume;
    }
  }

  setSwitch () {
    this.AutoDetectUSB = !this.AutoDetectUSB;
    this.rebuild();
  }

  rebuild () {
    log("Rebuild Database with ", this.AutoDetectUSB ? "USB Key": "Local Folder");
    this.setStop();
    this.init();
    this.start();
  }

  setRandom (random) {
    this.config.random = random;
    log("Set Random to", this.config.random);
  }

  getRandomInt (max) {
    return Math.floor(Math.random() * max);
  }

  /* create cvlc server */
  spawnCVLC () {
    if (this.cvlcPlayer) return
    const args = [
      "-I http",
      "--extraintf", "http",
      "--http-port", 8082,
      "--http-host", "localhost",
      "--http-password", this.cvlcPassword,
    ];
    this.cvlcPlayer = spawn("cvlc",args)
    this.cvlcPlayer.stdout.on('data', (data) => {
      console.log(`[MUSIC]  data: ${data}`);
    });
    
    this.cvlcPlayer.stderr.on('data', (data) => {
      console.error(`[MUSIC] stderr: ${data}`);
    });
    
    this.cvlcPlayer.on('close', (code) => {
      console.log(`[MUSIC]  exited with code ${code}`);
    });

    this.statusInterval = setInterval(async () => {
      const status = await this.vlc.status()
      if (status.state === "stopped") {
        if (this.MusicPlayerStatus.lastState) {
          this.setNext()
        } else {
          this.MusicPlayerStatus.connected = false;
          this.MusicPlayerStatus.lastState = false;
          this.send(this.MusicPlayerStatus);
        }
        return
      }
      this.MusicPlayerStatus.connected = true;
      this.MusicPlayerStatus.lastState = true;
      this.MusicPlayerStatus.current = status.time+1
      this.MusicPlayerStatus.volume = (parseInt(status.volume)*100)/256
      //console.log("--> status,", status)
      //console.log("meta()", await this.vlc.meta())
      this.send(this.MusicPlayerStatus);
    },1000)
  } 
}

module.exports = PLAYER;
