# Bandcamp mass unzipper

A script to recursively find and unzip bandcamp FLAC downloads. Files will be unzipped into a folder with the same name as the zip file.

I made this because I am lazy and hate unzipping these files manually... 

## Requirements

[NodeJS 12.x.x](https://nodejs.org/en/)
NPM 6.x.x

## Usage

- clone the repo

do an extraction only pass first
- `node index --path "path/to/folder" [--verbose] [--force]`

if no errors happen and a manual check looks good, clean up the zip files
- `node index --path "path/to/folder"  [--cleanup] [--verbose]`


## Parameters

### --path "path/to/folder"

Specify the path to a folder that contains the zip files or has sub folders that contain the zip files. Relative paths will be from the folder you are currently in

### --cleanup

*Use at your own peril!!!*

Removes the zip file after extraction. Also, if the folder the zip file is being extracted into has MP3 files of the same name, they will be removed.

### --verbose

Displays some more information

### --force

Force overwriting the FLAC file already exists
