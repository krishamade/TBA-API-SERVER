const WebSocket = require('ws')
const http = require('http')
const express = require('express')
const bodyParser = require("body-parser")
const app = express()
const moment = require('moment')
const Sentry = require('@sentry/node');
const superagent = require('superagent');


// Intialize Sentry.io project
Sentry.init({ dsn: '{INSERT DSN HERE}' });

// Declaring Variables for Server Side Application

//The Blue Alliance API Variables
var tbaApiKey = '{INSERT THEBLUEALLIANCE API KEY}' //TBA API Key
var districtKey = '{INSERT THEBLUEALLIANCE DISTRICT KEY HERE EXAMPLE 2020fim}' //TODO Sets the district key. Do not hardcode in production

var latestNotification = {
    notification: 'Empty',
} // Retrieves Message From Post and Adds in the Date Time

// WEBHOOK DATA: Set variables to store data depending on the message type
var matchScore
var startingCompLevel
var upcomingMatch
var allianceSelection
var awardsPosted
var mediaPosted
var districtPointsUpdated
var eventScheduleUpdated
var eventFinalResult
var ping
var broadcast
var webhookData

//The Blue Aliance V3 API Data: Variables and Objects
var tbaServerData = {} //Data to be sent to WebSocket Clients
var action = {}
var tbaCity
var tbaEventName
var tbaEventKey
var events = []
var name = {}
var matchData = []


//Variables Related to data from client
var clientData = {}

app.use(express.static('public'));

const server = http.createServer(app);

//Create web socket server
const wss = new WebSocket.Server({
    server
});
server.listen(8180, () => console.log("Websocket Server Started " + moment().format('LLLL')));

//Creates POST request route for the webhook receiver
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

app.post('/hook', function (req, res) {
    res.send('Success')
    latestNotification = {
        notification: req.body,
        timeReceived: moment().format('LTS'), // Will show time as Hour:Minute:Second 12:12:12
    }
    processNotification()
});

app.get('/api/latestNotification', function (req, res) {
    res.send(webhookData)
})

//TODO May want to scope webhook data into it's own function and seperate it from pulling from the standard api

const processNotification = async () => {
    matchScore = latestNotification['notification'].message_type === "upcoming_match" ? latestNotification : matchScore
    startingCompLevel = latestNotification['notification'].message_type === "match_score" ? latestNotification : startingCompLevel
    upcomingMatch = latestNotification['notification'].message_type === "starting_comp_level" ? latestNotification : upcomingMatch
    allianceSelection = latestNotification['notification'].message_type === "alliance_selection" ? latestNotification : allianceSelection
    awardsPosted = latestNotification['notification'].message_type === "awards_posted" ? latestNotification : awardsPosted
    mediaPosted = latestNotification['notification'].message_type === "media_posted" ? latestNotification : mediaPosted
    districtPointsUpdated = latestNotification['notification'].message_type === "district_points_updated" ? latestNotification : districtPointsUpdated
    eventScheduleUpdated = latestNotification['notification'].message_type === "schedule_updated" ? latestNotification : eventScheduleUpdated
    eventFinalResult = latestNotification['notification'].message_type === "final_results" ? latestNotification : eventFinalResult
    ping = latestNotification['notification'].message_type === "ping" ? latestNotification : ping
    broadcast = latestNotification['notification'].message_type === "broadcast" ? latestNotification : broadcast
    buildWebhookData()
}

const buildWebhookData = async () => {
    webhookData = {
        matchScore: matchScore,
        startingCompLevel: startingCompLevel,
        upcomingMatch: upcomingMatch,
        allianceSelection: allianceSelection,
        awardsPosted: awardsPosted,
        mediaPosted: mediaPosted,
        districtPointsUpdated: districtPointsUpdated,
        eventScheduleUpdated: eventScheduleUpdated,
        eventFinalResult: eventFinalResult,
        ping: ping,
        broadcast: broadcast,
        timeReceived: moment().format('LTS'), // Will show time as Hour:Minute:Second 12:12:12
    }
}

const getEvents = async () => {

    console.log("Getting Events from The Blue Alliance API")

    superagent
        .get(`https://www.thebluealliance.com/api/v3/district/${districtKey}/events/simple`)
        .set('X-TBA-Auth-Key', `${tbaApiKey}`)
        .set('Accept', 'application/json')
        .set('Content-type', 'application/json')
        .then(response => {
            let payloadData = response.body
            action = 'getEvents'
            for (event in payloadData) {
                events[event] = {
                    tbaCity: payloadData[event].city,
                    tbaEventName: payloadData[event].name,
                    tbaEventKey: payloadData[event].key,
                }
            }
            buildTbaData()
        }).catch(error => {
            console.log("There was an error: ", error)
        }).finally()
}

const getMatchData = async () => {
    matchData = []
    console.log("Getting Match Data from The Blue Alliance API")
    console.log(clientData.data)
    superagent
        .get(`https://www.thebluealliance.com/api/v3/event/${clientData.data}/matches`)
        .set('X-TBA-Auth-Key', `${tbaApiKey}`)
        .set('Accept', 'application/json')
        .set('Content-type', 'application/json')
        .then(response => {
            let payloadData = response.body
            console.log(payloadData)
            for (match in payloadData) {
                matchData[match] = {
                    matchKey: payloadData[match].key,
                    matchCompLevel: payloadData[match].comp_level,
                    redMatchScore: payloadData[match].alliances.red.score,
                    redMatchTeams: payloadData[match].alliances.red.team_keys,
                    redMatchScoreBreakdown: payloadData[match].score_breakdown.red,
                    blueMatchScore: payloadData[match].alliances.blue.score,
                    blueMatchTeams: payloadData[match].alliances.blue.team_keys,
                    blueMatchScoreBreakdown: payloadData[match].score_breakdown.blue
                }
            }
            console.log(matchData)
            buildTbaData()
        }).catch(error => {
            console.log("There was an error: ", error)
        }).finally()
}

const testConsoleOutput = async () => {
    console.log(devices)
}

const buildTbaData = async () => {
    tbaServerData = {
        action: action,
        data: {
            events: events,
            matchData: matchData,
        }
        
    }
    updateClients()
}

//Sends the updated information to our clients
const sendDataToClients = async () => {
    //Prints all data before sending
    console.log(tbaServerData)
    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
            client.send(JSON.stringify(tbaServerData))
        }
    });
}

//Sends the updated information to our clients
const updateClients = async () => {
    tbaServerData['action'] = "update"
    //Prints all data before sending
    //console.log(tbaServerData)
    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
            client.send(JSON.stringify(tbaServerData))
        }
    });
}

const reloadClients = async () => {
    tbaServerData['action'] = "refresh"
    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN) {
            client.send(JSON.stringify(devices))
        }
    });
}

//Creates function for async sleep if needed to delay functions
const sleep = ms => new Promise(res => setTimeout(res, ms))

wss.on('connection', (ws, req) => {
    //Alert server of client connection, then send ONLY that client what data we have for them.
    console.log("Client Connected.")

    ws.on('message', (data) => {
        console.log("A client sent us a message: ", data)
    })
    ws.onmessage = function (e) {
        console.log(clientData)
        clientData = JSON.parse(e.data)
        if (clientData['action'] === 'getEvents') {
            // received get events request
            console.log("Get Events Request")
            getEvents();
        }else if (clientData['action'] === 'getMatchData') {
            // received get match data request
            console.log("Get Match Data Request")
            getMatchData();
        }
    }

    ws.on('close', () => {
        console.log("A Client Has Disconnected.")
    });
})

const runProgram = async () => {
}

runProgram()
setInterval(updateClients, 5000)