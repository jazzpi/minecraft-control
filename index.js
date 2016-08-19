const os = require('os')
const fs = require('fs')
const path = require('path')

const express = require('express')
const bodyParser = require('body-parser')
const ps = require('ps-node')

const minecraft_dir = path.join(os.homedir(), 'ftb-infty')
const port = 9001

console.log(`Minecraft directory is ${minecraft_dir}, port is ${port}`)

const checkRunning = cb => {
	ps.lookup({
		command: '/bin/sh',
		arguments: 'ServerStart.sh'
	}, (err, results) => {
		if (err) {
			cb(err)
			return
		}
		if (results.length > 1) {
			cb('More than one start script running!')
			return
		}
		if (results.length == 0) {
			cb(false, false)
			return
		}
		ps.lookup({
			command: 'java',
			ppid: results[0].pid
		}, (err, results) => {
			if (err) {
				cb(err)
				return
			}
			if (results.length > 1) {
				cb('More than one java process running!')
				return
			}
			if (results.length == 0) {
				cb(false, false)
				return
			}
			console.log(`Server running with PID ${results[0].pid}`)
			cb(false, true, results[0].pid)
		})
	})
}

let app = express()
app.set('view engine', 'pug')
app.use(bodyParser.urlencoded({ extended: true }))

app.get('/', (req, res) => {
	let backups_dir = path.join(minecraft_dir, 'backups')
	fs.readdir(backups_dir, (err, files) => {
		let backups
		if (err) {
			console.error(`An error occured while reading ${backups_dir}: ${err}`)
			backups = ['An error occured trying to find the backups']
		} else {
			backups = files
		}
		res.render('index', { running: true, backups: backups.reverse() })
	})
})

app.post('/start', (req, res) => {
	console.log('Starting server!')
	res.redirect('/')
})

app.post('/stop', (req, res) => {
	console.log('Stopping server!')
	res.redirect('/')
})

app.post('/forcestop', (req, res) => {
	console.log('Force stopping server!')
	res.redirect('/')
})

app.post('/restore', (req, res) => {
	checkRunning((err, running) => {
		if (err) {
			res.status(500).render(
			    'error-redirect',
			    { message: 'An error occured trying to check if the server is running' })
			res.end()
			return
		}
		if (running) {
			res.render(
			    'error-redirect',
			    { message: 'The server is still running. Stop the server before restoring a backup!' })
			res.end()
			return
		}
		if (req.body.date == undefined ||
		    req.body.date.search(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/) == -1) {
			res.render('error-redirect',
			           { message: 'Invalid date specified!' })
			res.end()
			return
		}
		console.log(`Restoring backup ${req.body.date}`)
		res.render('restoring-backup', { date: req.body.date })
		res.end()
	})
})

app.listen(port, (err) => {
	if (err) {
		return console.log('An error occured:', err)
	}

	console.log(`Server is listening on port ${port}`)
})
