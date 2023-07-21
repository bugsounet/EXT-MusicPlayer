const USB = require('usb').usb
const Drives = require('drivelist')
const cvlc = require("@magicmirror2/cvlc")
const path = require("path")
const fs = require("fs")

var _log = function() {
    var context = "[MUSIC]"
    return Function.prototype.bind.call(console.log, console, context)
}()

var log = function() {
  //do nothing
}

class PLAYER {
  constructor(config, debug, callback = ()=>{}) {
    this.config= config
    this.default = {
      useUSB: false,
      modulePath: "./",
      musicPath: "/home",
      checkSubDirectory: false,
      autoStart: false,
      maxVolume: 256
    }
    this.config = Object.assign(this.default, this.config)
    this.sendSocketNotification = callback.sendSocketNotification
    if (debug == true) log = _log
    this.meta = null
    this.forceStop = false
    this.EndWithNoCb = false
    this.AutoDetectUSB= false
    this.FileExtensions = ['mp3','flac','wav', 'ogg', 'opus', 'm4a']
    this.Music = null
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
      id: null,
      idMax: 0,
      format: null
    }
    this.MusicInterval = null
    this.audioList= []
    if (this.config.useUSB) this.AutoDetectUSB= true
    this.USBAutoDetect()
  }

  async init () {
    // Re-init all value :)
    this.Music = null
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
      id: null,
      idMax: 0,
      format: null
    }
    this.MusicInterval = null
    this.audioList= []
  }

  async start () {
    if (this.AutoDetectUSB) { // USB Key is already connected !
      await this.USBSearchDrive()
    }
    else await this.search(this.config.musicPath)
    if (this.audioList.length) {
      console.log("[MUSIC] Audio files Found:", this.audioList.length)
      if (this.config.autoStart && this.AutoDetectUSB) this.MusicPlayList()
    } else console.log("[MUSIC] No Audio files Found!")
  }

  async USBSearchDrive () {
    let drives = await Drives.list()
    drives.forEach(async (drive) => {
      if (!drive.isSystem && drive.isUSB && drive.mountpoints[0]){
        log("Found USB Drive:", drive.description , "in", drive.device)
        var drive_path = path.normalize(drive.mountpoints[0].path)
        log("USB Path Drive:", drive_path)
        await this.search(drive_path)
      }
    })
  }

  USBAutoDetect () {
    log("AutoDetect USB Key:" , this.AutoDetectUSB ? "On" : "Off")
    USB.on('attach', () => { this.PlugInUSB() })
    USB.on('detach', () => { this.PlugOutUSB() })
  }

  PlugInUSB () {
    if (!this.AutoDetectUSB) return
    log("USB Key Detected")
    setTimeout(async () => {
      this.audioList= []
      await this.USBSearchDrive()
      if (this.audioList.length) {
        console.log("[MUSIC] Audio files Found:", this.audioList.length)
        if (this.config.autoStart) this.MusicPlayList()
      } else console.log("[MUSIC] USB-KEY: No Audio files Found!")
    }, 5000)
  }

  PlugOutUSB () {
    if (!this.AutoDetectUSB) return
    log("Warn: USB Key Released!")
    this.destroyPlayer()
    this.init()
  }

  search (Path) {
    if (!fs.existsSync(Path)){
      console.log("[MUSIC] Error: No such directory",Path)
      return
    }
    log("Search in", Path)
    var FileList=fs.readdirSync(Path)
    FileList.forEach(file => {
      var filename=path.join(Path,file)
      var stat = fs.lstatSync(filename)
      if (stat.isDirectory()){
        if (this.config.checkSubDirectory) this.search(filename)
      } else {
        var isValidFileExtension = this.checkValidFileExtension(filename)
        if (isValidFileExtension) {
          log("Found:", filename)
          this.audioList.push(filename)
        }
      }
    })
    this.MusicPlayerStatus.idMax = this.audioList.length-1
  }

  checkValidFileExtension (filename) {
    var found = false
    this.FileExtensions.forEach(extension => {
      if (filename.toLowerCase().endsWith(extension)) found = true
    })
    return found
  }

  async MusicPlayList () {
    await this.destroyPlayer()
    if (!this.audioList.length) {
      this.MusicPlayerStatus.idMax = 0
      return console.log("[Music] No Music to Read")
    } else {
      this.MusicPlayerStatus.idMax = this.audioList.length-1
    }

    if (!this.config.random) {
      if (this.MusicPlayerStatus.id == null) {
        this.MusicPlayerStatus.id = 0
        this.MusicPlayer()
      } else {
        this.MusicPlayerStatus.id++
        if (this.MusicPlayerStatus.id > this.MusicPlayerStatus.idMax) this.MusicPlayerStatus.id = null
        else this.MusicPlayer()
      }
    } else this.MusicPlayer()
  }

  /** Music Player **/
  async MusicPlayer () {
    if (this.Music) {
      console.log("error already launched")
      return
    }
    try {
      if (!this.meta) this.meta = await this.loadLib("music-metadata")
      if (this.config.random) {
        let randomId = await this.getRandomInt(this.audioList.length)
        if (randomId == this.MusicPlayerStatus.id) return this.MusicPlayer () // same song ?
        this.MusicPlayerStatus.id = randomId
      }
      console.log("Info:", this.audioList[this.MusicPlayerStatus.id])
      const metadata = await this.meta.parseFile(this.audioList[this.MusicPlayerStatus.id])

      log("Infos from file:", this.audioList[this.MusicPlayerStatus.id])
      log("Title:", metadata.common.title ? metadata.common.title : "unknow" )
      log("Artist:" , metadata.common.artist ? metadata.common.artist: "unknow")
      log("Release Date:", metadata.common.date ? metadata.common.date : "unknow")
      log("Duration:", parseInt((metadata.format.duration).toFixed(0)) + " secs")
      log("Format:", metadata.format.codec)
      log("PlayList Id:", this.MusicPlayerStatus.id+"/"+this.MusicPlayerStatus.idMax)

      // make structure
      this.MusicPlayerStatus.connected= false
      this.MusicPlayerStatus.current= 0
      this.MusicPlayerStatus.duration= parseInt((metadata.format.duration).toFixed(0))
      this.MusicPlayerStatus.file= this.audioList[this.MusicPlayerStatus.id]
      this.MusicPlayerStatus.title= metadata.common.title ? metadata.common.title : path.basename(this.MusicPlayerStatus.file)
      this.MusicPlayerStatus.artist= metadata.common.artist ? metadata.common.artist: "-"
      this.MusicPlayerStatus.date= metadata.common.date ? metadata.common.date : "-"
      this.MusicPlayerStatus.seed = Date.now()
      this.MusicPlayerStatus.format = (metadata.format.codec == "MPEG 1 Layer 3") ? "MP3" : metadata.format.codec
      this.MusicPlayerStatus.device= this.AutoDetectUSB ? "USB" : "FOLDER"

      const cover = this.meta.selectCover(metadata.common.picture);
      if (cover) {
        let picture = `data:${cover.format};base64,${cover.data.toString('base64')}`;
        log("Cover Format:", cover.format)
        var filepath = this.base64ToImg(picture, this.config.modulePath + "/tmp/Music/", 'cover')
        log("Cover Saved to:", filepath)
        this.MusicPlayerStatus.cover = path.basename(filepath)
      }
      else {
        log("No Cover Found")
        this.MusicPlayerStatus.cover = null
      }
      var cvlcArgs = []//"--play-and-exit"]
      this.Music = new cvlc(cvlcArgs)
      this.Music.play(
        this.MusicPlayerStatus.file,
        ()=> {
          this.MusicPlayerStatus.connected = true
          log("Start playing:", path.basename(this.MusicPlayerStatus.file))
          this.Music.cmd("volume " + this.config.maxVolume)
          this.MusicPlayerStatus.pause = false
          this.realTimeInfo()
        },
        ()=> {
          log("Music is now ended !")
          clearInterval(this.MusicInterval)
          if ((this.MusicPlayerStatus.id >= this.MusicPlayerStatus.idMax) || this.MusicPlayerStatus.id == null) {
            this.MusicPlayerStatus.connected = false
            this.send(this.MusicPlayerStatus)
          }
          if (this.EndWithNoCb) {
            this.EndWithNoCb = false
            return
          }
          if (this.forceStop) {
            this.forceStop = false
            this.MusicPlayerStatus.connected = false
            this.send(this.MusicPlayerStatus)
            return
          }
          this.MusicPlayList()
        }
      )
    } catch (error) {
      console.error("[MUSIC] Music Player Error:", error.message)
      clearInterval(this.MusicInterval)
      if ((this.MusicPlayerStatus.id >= this.MusicPlayerStatus.idMax) || this.MusicPlayerStatus.id == null) {
        this.MusicPlayerStatus.connected = false
        this.send(this.MusicPlayerStatus)
      }
      this.MusicPlayList()
    }
  }

  realTimeInfo () {
    this.MusicInterval = setInterval(() => {
      this.Music.cmd("get_time", (err, response) => {
        this.MusicPlayerStatus.current= (parseInt(response)+1)
        this.Music.cmd("volume", (err,res) => {
          this.MusicPlayerStatus.volume= (parseInt(res)*100)/256
        })
        this.send(this.MusicPlayerStatus)
      })
    }, 1000)
  }

  send (data) {
    this.sendSocketNotification("Music_Player", data)
  }

  destroyPlayer () {
    if (this.Music) {
      this.Music.destroy()
      this.Music= null
      clearInterval(this.MusicInterval)
      log("Boom! Cvlc Player Destroyed!")
    }
  }

  getConnected () {
    return this.MusicPlayerStatus.connected
  }

  setPause () {
    if (this.Music) {
      this.Music.cmd("pause")
      log("Paused")
      this.MusicPlayerStatus.pause= !this.MusicPlayerStatus.pause
      this.sendSocketNotification("Music_Player_PAUSE")
    }
  }

  setPlay () {
    if (this.Music) {
      this.Music.cmd("play")
      log("Play")
    }
    else {
      if (!this.config.random) {
        this.MusicPlayerStatus.id--
        if (this.MusicPlayerStatus.id < 0) this.MusicPlayerStatus.id = 0
        this.MusicPlayList()
        log("Play Last Title")
      } else this.MusicPlayer ()
    }
    this.MusicPlayerStatus.pause= false
  }

  setStop () {
    this.forceStop = true
    this.destroyPlayer()
    log("Stop")
  }

  async setNext () {
    if (this.Music) {
      this.EndWithNoCb = true
      await this.destroyPlayer()
      if (!this.config.random) {
        this.MusicPlayerStatus.id++
        if (this.MusicPlayerStatus.id > this.MusicPlayerStatus.idMax) this.MusicPlayerStatus.id = 0
      }
      this.MusicPlayer()
      log("Next")
    }
  }

  async setPrevious () {
    if (this.Music) {
      this.EndWithNoCb = true
      await this.destroyPlayer()
      if (!this.config.random) {
        this.MusicPlayerStatus.id--
        if (this.MusicPlayerStatus.id < 0) this.MusicPlayerStatus.id = 0
      }
      this.MusicPlayer()
      log("Previous")
    }
  }

  setVolume (volume) { // Warn must be 0-256
    if (this.Music) {
      this.Music.cmd("volume " + volume)
      log("Volume", volume)
    }
  }

  setNewMax (volume) {
    if (volume) {
      log("Received new Volume Max:" , volume) // keep memoroy this volume for next song !
      this.config.maxVolume = volume
    }
  }

  setSwitch () {
    this.AutoDetectUSB = !this.AutoDetectUSB
    this.rebuild()
  }

  rebuild () {
    log("Rebuild Database with ", this.AutoDetectUSB ? "USB Key": "Local Folder")
    this.setStop()
    this.init()
    this.start()
  }

  setRandom (random) {
    this.config.random = random
    log("Set Random to", this.config.random)
  }

  /** transform base64 to image **/
  base64ToImg (data, destpath, name) {
    var result = this.img(data)
    var filepath = path.join(destpath, name + result.extname)

    fs.writeFileSync(filepath, result.base64, { encoding: 'base64' })
    return filepath
  }

  img(data) {
    var reg = /^data:image\/([\w+]+);base64,([\s\S]+)/
    var match = data.match(reg)
    var baseType = {
      jpeg: 'jpg'
    }

    baseType['svg+xml'] = 'svg'

    if (!match) {
      throw new Error('image base64 data error')
    }

    var extname = baseType[match[1]] ? baseType[match[1]] : match[1]

    return {
      extname: '.' + extname,
      base64: match[2]
    }
  }
  
  async loadLib(lib) {
    const loaded = await import(lib)
    return loaded
  }

  getRandomInt(max) {
    return Math.floor(Math.random() * max)
  }
}

module.exports = PLAYER
