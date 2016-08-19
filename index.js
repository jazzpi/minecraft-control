const os = require('os')
const fs = require('fs')
const path = require('path')
const spawn = require('child_process').spawn

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
		checkRunning((err, running) => {
			if (err) {
				res.status(500).render(
					'error-redirect',
					{ message: 'An error occured trying to check if the server is running' })
				res.end()
				return
			}
			res.render('index', { running: running, backups: backups.reverse() })
		})
	})
})

app.post('/startbackup', (req, res) => {
	checkRunning((err, running) => {
		if (err) {
			res.status(500).render(
				'error-redirect',
				{ message: 'An error occured trying to check if the server is running' })
			res.end()
			return
		}
		if (!running) {
			res.render(
				'error-redirect',
				{ message: 'The server is not running!' })
			res.end()
			return
		}
		console.log('Starting backup!')
		spawn('tmux', ['send-keys', '-t', '0:1', 'admin backup start', 'C-m'])
		res.redirect('/')
	})
})

app.post('/start', (req, res) => {
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
				{ message: 'The server is already running!' })
			res.end()
			return
		}
		console.log(`Starting server in directory ${minecraft_dir}`)
		spawn('tmux', ['send-keys', '-t', '0:1', 'C-z', 'cd', ` '${minecraft_dir}'`, 'C-m', './ServerStart.sh', 'C-m'])
		res.redirect('/')
	})
})

app.post('/stop', (req, res) => {
	checkRunning((err, running) => {
		if (err) {
			res.status(500).render(
				'error-redirect',
				{ message: 'An error occured trying to check if the server is running' })
			res.end()
			return
		}
		if (!running) {
			res.render(
				'error-redirect',
				{ message: 'The server is not running!' })
			res.end()
			return
		}
		console.log('Stopping server!')
		// Send "stop\n" in first window of tmux session 0
		spawn('tmux', ['send-keys', '-t', '0:1', 'stop', 'C-m'])
		res.redirect('/')
	})
})

app.post('/forcestop', (req, res) => {
	checkRunning((err, running, pid) => {
		if (err) {
			res.status(500).render(
				'error-redirect',
				{ message: 'An error occured trying to check if the server is running' })
			res.end()
			return
		}
		if (!running) {
			res.render(
				'error-redirect',
				{ message: 'The server is not running!' })
			res.end()
			return
		}
		console.log('Force stopping server!')
		spawn('kill', ['-9', pid])
		res.redirect('/')
	})
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
		let renderFile = filename => {
			let fd = fs.openSync(path.join(process.cwd(), 'views', filename), 'r')
			res.write(fs.readFileSync(fd))
			fs.close(fd, () => {})
		}
		console.log(`Restoring backup ${req.body.date}`)
		res.set('Content-Type', 'text/html')
		res.writeHead(200)
		renderFile('restoring-backup.html')
		res.write(` ${req.body.date}...</p>`)
		let rmProc = spawn('rm', ['-rf', path.join(minecraft_dir, 'world')])
		rmProc.on('exit', code => {
			if (code !== 0) {
				console.error(`Restoring backup was unsuccessful, rm exited with ${code}`)
				renderFile('backup-unsuccessful.html')
				res.end()
				return
			}
			let unzipProc = spawn(
				'unzip',
				[path.join(minecraft_dir, 'backups', req.body.date, 'backup.zip')],
				{ cwd: minecraft_dir })
			unzipProc.stderr.on('data', data => {
				console.error(`[unzip/STDERR] ${data.toString()}`)
			})
			unzipProc.on('exit', code => {
				if (code === 0) {
					console.log('Restoring backup was successful')
					renderFile('backup-successful.html')
				} else {
					console.error(`Restoring backup was unsuccessful, unzip exited with ${code}`)
					renderFile('backup-unsuccessful.html')
				}
				res.end()
			})
		})
	})
})

app.listen(port, (err) => {
	if (err) {
		return console.log('An error occured:', err)
	}

	console.log(`Server is listening on port ${port}`)
})
