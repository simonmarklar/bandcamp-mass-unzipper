'use strict'

const yargs = require('yargs').boolean('cleanup').boolean('force').boolean('verbose')
const StreamZip = require('node-stream-zip')
const path = require('path')
const _fs = require('fs')
const fs = _fs.promises

const {path: relativePath, cleanup, force, verbose} = yargs.argv

const time =  (fn) => async () => {
  const start = Date.now()
  await fn()
  const runtime = (Date.now() - start) / 1000
  console.log(`Done in ${runtime} seconds`)
}


const getTargetPath = (userPath) => {
  if (!userPath) return process.cwd()

  if (!path.isAbsolute(userPath)) {
    return path.join( process.cwd(), userPath)
  }

  return userPath
}

const makeExtractionFolder = (filename) => {
  const basename = path.basename(filename, '.zip')
  const targetFolder = path.join(path.dirname(filename), basename)
  return fs.stat(targetFolder).catch(() => fs.mkdir(targetFolder)).then(() => targetFolder)
}

const removeExistingFile = (newFileName) => {
  const ext = path.extname(newFileName)
  if (!cleanup || ext !== '.flac') {
    // incase the zip contained .mp3s
    return Promise.resolve()
  }

  const existingFilename = path.format({
    ...path.parse(newFileName),
    base: null,
    ext: '.mp3'
  })

  verbose && console.log(`removing ${path.basename(existingFilename)}`)
  return fs.unlink(existingFilename).catch(err => true)
}

const getZipStreams = function (zipFilePath, targetFolder) {
  const zip = new StreamZip({
      file: zipFilePath,
      storeEntries: true
  });

  zip.on('error', (err) => {
    console.error(err)
  })

  const streams = []

  zip.on('entry', entry => {
    const dest = path.join(targetFolder, entry.name)

      let stats
      try {
        stats = _fs.statSync(dest)
      } catch(e) {
        // ignore if the file doesnt exist - thats good!
      }

      let skip = false

      if ((stats && stats.isFile() )) {
        skip = true && !force
      }

      streams.push(new Promise((resolve, reject) =>  zip.stream(entry.name, (err, stream) => {
        if (err) { 
            console.error(err); 
            return; 
        }

        verbose && console.log(`${skip ? 'Skipping ' : 'Writing '}${entry.name}`)

        const finish = () => {
          verbose && !skip && console.log(`finished writing ${entry.name}`)
          resolve(removeExistingFile(dest))
        }

        if (skip) {
          return finish()
        }

        const writeStream = _fs.createWriteStream(dest)
        writeStream.on('error', (err) => {
          console.error(err)
          reject(err)
        })
        writeStream.on('finish', finish)

        stream.on('error', (err) => { 
          console.error(err)
          writeStream.end();
          reject(err)
        });

        stream.pipe(writeStream);
      })))
  });

  return new Promise((resolve, reject) => {
    zip.on('ready', () => {
      resolve([zip, streams])
    })
  })
}

const processZipFiles = async function * (zipFiles) {
  for await (const filename of zipFiles) {
    const targetFolder = await makeExtractionFolder(filename);

    yield [filename, ...(await getZipStreams(filename, targetFolder))]
  }
}

const getZipFiles = async function * (_path) {
  try {
    await fs.access(_path)
    const dir = await fs.opendir(_path)
    for await (const fsObject of dir) {
      if (fsObject.isDirectory()) {
        yield * getZipFiles(path.join(_path, fsObject.name))
      }
      if (fsObject.isFile() && path.extname(fsObject.name) === '.zip') {
        yield path.join(_path, fsObject.name)
      } 
    }
  } catch (e) {
    // skip this folder if there is an issue reading it
    verbose && console.log(`cannot access path ${_path}`)
  }
}

const processFolder = async () => {
  try {
    const workDir = getTargetPath(relativePath)
    for await ( const [filename, zip, streams] of processZipFiles(getZipFiles(workDir))) {
      console.log(`Processing: ${filename}`)
      // wait for all the files to be written and old files deleted
      const failures = await Promise.allSettled(streams).then((results) => results.reduce((memo, {status}, index) => {
        if (status !== 'fulfilled') {
          memo.push(streams[index])
        }

        return memo
      }, []))

      if (failures.length) {
        console.log('WARNING! The following files had errors:')
        failures.forEach(({value}, index) => {
          console.log(`${streams[index].name}: ${value}`)
        })
        return zip.close()
      } 

      // avoid unhandled rejection error
      setTimeout(() => {
        zip.close()
        if (cleanup) {
          verbose && console.log(`Removing ${filename}`)
          fs.unlink(filename).catch(e => {
            console.log(`could not remove ${filename}`)
            verbose && console.log(e)
          })
        }
      }, 150)
    }
  } catch (e) {
    console.error(e)
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.log('uncaught exception')
  console.error(err)
});

time(processFolder)()