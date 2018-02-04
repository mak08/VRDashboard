// UI Controller


var controller = function () {

    const LightRed = '#ffa0a0';
    
    // ToDo: clear stats if user/boat changes
    var currentUserId;
    var requests = new Map();

    // Polars and other game parameters, indexed by polar._id
    var polars =  [];

    var races = new Map();
    var racefriends = new Map();

    var sailNames = [0, "Jib", "Spi", "Staysail", "Light Jib", "Code0", "Heavy Gnk", "Light Gnk", 8, 9, "Auto", "Jib (Auto)", "Spi (Auto)", "Staysail (Auto)", "Light Jib (Auto)", "Code0 (Auto)", "Heavy Gnk (Auto)", "Light Gnk (Auto)"];

    function addSelOption(race, beta, disabled) {
        var option = document.createElement("option");
        option.text =race.name + (beta?" beta":"");
        option.value = race.id;
        option.betaflag = beta;
        option.disabled = disabled;
        selRace.appendChild(option);
    }
    
    function initRace(race, disabled) {
        race.tableLines=[];
        races.set(race.id, race);
        var rfdef = new Map();
        rfdef.table = new Array();
        rfdef.uinfo = new Object();
        racefriends.set(race.id, rfdef);
        addSelOption(race, false, disabled);
        if (race.has_beta) {
            addSelOption(race, true, disabled);
        }
    }

    function initRaces() {
        var xhr = new XMLHttpRequest();
        xhr.onload = function() {
            var json = xhr.responseText;
            json = JSON.parse(json);
            for (var i = 0; i < json.races.length; i++) {
                json.races[i].source = "zezo";
                initRace(json.races[i],true);
            }
            divRaceStatus = document.getElementById("raceStatus");
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            divFriendList = document.getElementById("friendList");
            divFriendList.innerHTML = "No friend positions received yet";
        }
        xhr.open('GET', 'http://zezo.org/races2.json');
        //xhr.open('GET', 'races2.json');
        xhr.send();
    }

    // Earth radius in nm, 360*60/(2*Pi);
    var radius =  3437.74683

    var selRace, cbRouter, cbReuseTab, cbLocalTime;
    var lbBoatname;
    var divPositionInfo, divRecordLog, divRawLog;
    var callUrlFunction;
    var initialized = false;

    var tableHeader =  '<tr>'
        + '<th>' + 'Time' + '</th>'
        + commonHeaders()
        + '<th title="Reported speed">' + 'vR (kn)' + '</th>'
        + '<th title="Calculated speed (Δd/Δt)">' + 'vC (kn)' + '</th>'
        + '<th title="Polar-derived speed">' + 'vT (kn)' + '</th>'
        + '<th title="Calculated distance">' + 'Δd (nm)' + '</th>'
        + '<th title="Time between positions">' + 'Δt (s)' + '</th>'
        + '<th title="Sail change time remaining">' + 'Sail' + '</th>'
        + '<th title="Gybing time remaining">' + 'Gybe' + '</th>'
        + '<th title="Tacking time remaining">' + 'Tack' + '</th>'
        + '</tr>';

    var raceStatusHeader =  '<tr>'
        + '<th title="Call Router">' + 'RT' + '</th>'
        + '<th>' + 'Race' + '</th>'
        + '<th>' + 'Leg' + '</th>'
        + commonHeaders()
        + '<th title="Boat speed">' + 'Speed' + '</th>'
        + '<th>' + 'Options' + '</th>'
        + '<th>' + 'Cards' + '</th>'
        + '<th title="Time to next barrel">' + 'Pack' + '</th>'
        + '<th>' + 'Sail' + '</th>' // red if badsail
        + '<th title="Boat is aground">' + 'Agnd' + '</th>'
        + '<th title="Stealth mode">' + 'Stlt' + '</th>'
        + '<th title="Boat is maneuvering, half speed">' + 'Mnvr' + '</th>'
        + '<th>' + 'Last Command' + '</th>'
        +  '</tr>';

    var friendListHeader =  '<tr>'
        + '<th title="Call Router">' + 'RT' + '</th>'
        + '<th>' + 'Friend/Opponent' + '</th>'
        + '<th>' + 'Last Update' + '</th>'
        + '<th>' + 'Rank' + '</th>'
        + '<th title="Distance To Finish">' + 'DTF' + '</th>'
        + '<th title="Distance To Us">' + 'DTU' + '</th>'
        + '<th>' + 'Sail' + '</th>'
        + '<th>' + 'State' + '</th>'
        + '<th>' + 'Position' + '</th>'
        + '<th title="Heading">' + 'HDG' + '</th>'
        + '<th title="True Wind Angle">' + 'TWA' + '</th>'
        + '<th title="True Wind Speed">' + 'TWS' + '</th>'
        + '<th title="Boat speed">' + 'Speed' + '</th>'
        +  '</tr>';


    function commonHeaders() {
        return '<th>' + 'Rank' + '</th>'
            + '<th title="Distance To Leader">' + 'DTL' + '</th>'
            + '<th title="Distance To Finish">' + 'DTF' + '</th>'
            + '<th>' + 'Position' + '</th>'
            + '<th title="Heading">' + 'HDG' + '</th>'
            + '<th title="True Wind Angle">' + 'TWA' + '</th>'
            + '<th title="True Wind Speed">' + 'TWS' + '</th>'
            + '<th title="True Wind Direction"> ' + 'TWD' + '</th>'
            + '<th title="Auto TWA activated">' + 'aTWA' + '</th>'
            + '<th title="Auto Sail time remaining">' + 'aSail' + '</th>';
    }

    function printLastCommand(lcActions) {
        var lastCommand = "";
        
        lcActions.map( function (action) {
            if ( action.type == "heading" ) {
                lastCommand +=  (action.autoTwa?" TWA":" HDG") + '=' + roundTo(action.value, 1);
            } else if ( action.type == "sail" ) {
                lastCommand += ' Sail=' + sailNames[action.value];
            } else if ( action.type == "prog" ) {
                action.values.map(function ( progCmd ) {
                    var progTime = formatDate(progCmd.ts);
                    lastCommand += (progCmd.autoTwa?" TWA":" HDG") + "=" + roundTo(progCmd.heading, 1) + ' @ ' + progTime + "; ";
                });
            } else if ( action.type == "wp" ) {
                action.values.map(function (waypoint) {
                    lastCommand += " WP: " + formatPosition(waypoint.lat, waypoint.lon) + "; ";
                });
            }
        });
        return lastCommand;
    }

    function commonTableLines(r) {

        var autoSail = formatHMS(r.curr.tsEndOfAutoSail - r.curr.lastCalcDate);

        var twaFG = (r.curr.twa < 0)?"red":"green";
        var twaBold = r.curr.twaAuto?"font-weight: bold;":"";
        var hdgFG = r.curr.twaAuto?"black":"blue";
        var hdgBold = r.curr.twaAuto?"font-weight: normal;":"font-weight: bold;";

        return "<td>" + ((r.rank)?r.rank:"-") + "</td>"
            + "<td>" + ((r.dtl)?r.dtl:"-") + "</td>"
            + "<td>" + roundTo(r.curr.distanceToEnd, 1) + "</td>"
            + "<td>" + formatPosition(r.curr.pos.lat, r.curr.pos.lon) + "</td>"
            + '<td style="color:' + hdgFG + ';' + hdgBold + '">' + roundTo(r.curr.heading, 1) + "</td>"
            + '<td style="color:' + twaFG + ';' + twaBold + '">' + roundTo(Math.abs(r.curr.twa), 1) + "</td>"
            + "<td>" + roundTo(r.curr.tws, 2) + "</td>"
            + "<td>" + roundTo(r.curr.twd, 1) + "</td>"
            + "<td>" + (r.curr.twaAuto?"Yes":"No") + "</td>"
            + "<td>" + autoSail + "</td>";
    }

    function makeRaceStatusLine (pair) {
        var r = pair[1];
        if ( r.curr == undefined ) {
            return "";
        } else {

            var sailNameBG = r.curr.badSail?LightRed:"lightgreen";
            var agroundBG = r.curr.aground?LightRed:"lightgreen";

            var manoeuvering = (r.curr.tsEndOfSailChange  > r.curr.lastCalcDate)
                || (r.curr.tsEndOfGybe  > r.curr.lastCalcDate)
                || (r.curr.tsEndOfTack > r.curr.lastCalcDate);

            var lastCommand = "";
            var lastCommandBG = "white";
            if ( r.lastCommand != undefined ) {
                // ToDo: error handling; multiple commands; expiring?
                var lcTime = formatTime(r.lastCommand.request.ts);
                lastCommand = printLastCommand(r.lastCommand.request.actions);
                lastCommand = "T:" + lcTime + ' Actions:' + lastCommand;
                if ( r.lastCommand.rc != "ok" ) {
                    lastCommandBG = LightRed;
                }
            }

            var cards = "";
            var regPack = "";
            var regColor = "";

            if (r.curr.fullOptions !== undefined) {
                cards = "Full";
                regPack = "N/A";
            } else {
                for ( var key in r.curr.cards ) {
                    cards =  cards + " " + key + ":" + r.curr.cards[key];
                }
                if (r.curr.regPack) { 
                    if (r.curr.regPack.tsNext > r.curr.lastCalcDate) {  
                        regPack = formatHMS(r.curr.regPack.tsNext - r.curr.lastCalcDate);
                    } else {
                        regPack = "Ready";
                        regColor = ' style="background-color: lightgreen;"';
                    } 
                }
                if (r.curr.soloCard) {
                    regPack += "<br>Solo: ";
                    if (r.curr.soloCard.ts > r.curr.lastCalcDate) {
                        regPack += r.curr.soloCard.code + ":" + formatMS(r.curr.soloCard.ts - r.curr.lastCalcDate);
                    } else {
                        regPack += "?";
                    }
                }
            } 

            var info = '-';
            if(r.type === "leg") {
                info = "<span>" + r.legName + "</span>";
            } else if(r.type === "record") {
                info = " <span>Record, Attempt " + parseInt(r.record.attemptCounter) + "</span>";
            }
            if(r.type === "record" && r.record.lastRankingGateName) {
                info += "<br/><span>@" + r.record.lastRankingGateName + "</span>";
            }

            var trstyle = "hov";
            if(r.id === selRace.value) trstyle += " sel";
            return "<tr class='" + trstyle +"' id='rs:" + r.id + "'>"
                + (r.url ? ("<td class='tdc' id='rt:" + r.id + "'>&#x2388;</td>") : "<td>&nbsp;</td>")
                + "<td>" + r.name + "</td>"
                + "<td>" + info + "</td>"
                + commonTableLines(r)
                + "<td>" + roundTo(r.curr.speed, 2) + "</td>"
                + "<td>" + ((r.curr.options.length == 8)?'Full':r.curr.options.join(' ')) + "</td>"
                + "<td>" + cards + "</td>"
                + "<td" + regColor + ">" + regPack + "</td>"
                + '<td style="background-color:' + sailNameBG + ';">' + sailNames[r.curr.sail] + "</td>"
                + '<td style="background-color:' + agroundBG +  ';">' + ((r.curr.aground)?"AGROUND":"No") + "</td>"
                + "<td>" + ((r.curr.stealthMode > r.curr.lastCalcDate)?"Yes":"No") + "</td>"
                + "<td>" + (manoeuvering?"Yes":"No") + "</td>"
                + '<td style="background-color:' + lastCommandBG +  ';">' + lastCommand + "</td>"
                + "</tr>";
        }
    }

    function makeFriendListLine (uid) {
        if ( uid == undefined ) {
            return "";
        } else {
            var r = this.uinfo[uid];
            var race = races.get(selRace.value);
            if ( r == undefined ) return "";
            var nameBold = (r.mode == "followed") ?"font-weight: bold;":"";
            return "<tr class='hov' id='ui:" + uid + "'>"
                + (race.url ? ("<td class='tdc' id='rt:" + uid + "'>&#x2388;</td>") : "<td>&nbsp;</td>")
                + '<td style="' + nameBold + '">' + r.displayName + "</td>"
                + "<td>" + formatDate(r.ts) + "</td>"
                + "<td>" + ((r.rank)?r.rank:"-") + "</td>"
                + "<td>" + ((r.distanceToEnd)?r.distanceToEnd:"-") + "</td>"
                + "<td>" + ((r.distanceToUs)?r.distanceToUs:"-") + "</td>"
                + "<td>" + sailNames[r.sail] + "</td>"
                + "<td>" + r.state + "</td>"
                + "<td>" + formatPosition(r.pos.lat, r.pos.lon) + "</td>"
                + "<td>" + roundTo(r.heading, 1) + "</td>"
                + "<td>" + roundTo(Math.abs(r.twa), 1) + "</td>"
                + "<td>" + roundTo(r.tws, 1) + "</td>"
                + "<td>" + roundTo(r.speed, 2) + "</td>"
                + "</tr>";
        }
    }

    function makeRaceStatusHTML () {
        return "<table style=\"width:100%\">"
            + raceStatusHeader
            + Array.from(races||[]).map(makeRaceStatusLine).join(' ');
            + "</table>";
    }

    function makeFriendsHTML(rf) {
        if (rf === undefined) {
            return "No friend positions received yet";
        } else {
            return "<table style=\"width:100%\">"
                + friendListHeader
                + Array.from(rf.table||[]).map(makeFriendListLine, rf).join(' ');
                + "</table>";
        }
    }

    function makeTableHTML (r) {
        return '<table style="width:100%">'
            + tableHeader
            + (r === undefined?"":r.tableLines.join(' '))
            + "</table>";
    }

    function updateFriendUinfo(rid, mode, uid, data) {
        var rfd = racefriends.get(rid);
        var race = races.get(rid);
        var ndata = rfd.uinfo[uid];
        if(!ndata) {
            ndata = new Object();
            rfd.uinfo[uid] = ndata;
        }
        if(mode == "usercard") {
            data.mode = "opponents";
            data.ts = data.lastCalcDate;
        }
        if(ndata.mode == "followed") data.mode = "followed"; // keep followed state if present

        var elemlist = ["displayName", "ts", "rank", "type", "state", "pos","heading","twa","tws","speed","mode","distanceToEnd","sail"];
        // copy elems from data to uinfo
        elemlist.forEach(function(tag) {
            if(data[tag]) {
                ndata[tag] = data[tag];
                if(tag == "pos") { // calc gc distance to us
                    ndata.distanceToUs = roundTo(gcDistance(race.curr.pos.lat,  race.curr.pos.lon, data.pos.lat, data.pos.lon) / 1.852,1);
                }
            }
        });
    }

    function updateFriends(rid, mode, data) {
        var rfd = racefriends.get(rid);
        var fln = new Array();
        var flk = new Array();

        /* keep old records of other types */
        rfd.table.forEach(function(oelem) {
            var ouser = rfd.uinfo[oelem];
            if(ouser.mode != mode) flk.push(oelem);
        });

        data.forEach(function(delem) {
            delem.mode = mode;
            if (!delem.ts) delem.ts = Date.now();
            if (mode == "opponents") {
                if(delem.type == "pilotBoat") {
                    return;
                } else if(delem.type == "real") {
                    delem.displayName = delem.extendedInfos.boatName;
                    delem.rank = delem.extendedInfos.rank;
                }
            }
            fln.push(delem.userId);
            updateFriendUinfo(rid, mode, delem.userId, delem);
        });

        if (mode == "followed") {
            rfd.table = fln.concat(flk);
        } else {
            rfd.table = flk.concat(fln);
        }
    }

    function formatSeconds (value) {
        if ( value < 0 ) {
            return "-";
        } else {
            return roundTo(value/1000, 0);
        }
    }

    function formatHMS(seconds) {
        if (seconds === undefined || isNaN(seconds) || seconds < 0) {
            return '-';
        }

        seconds = Math.floor(seconds/1000);

        var hours = Math.floor(seconds/3600);
        seconds -= 3600 * hours;

        var minutes = Math.floor(seconds/60);
        seconds -= minutes * 60;

        return pad0(hours) + 'h' + pad0(minutes) + 'm'; // + seconds + 's';
    }

    function formatMS(seconds) {
        if (seconds === undefined || isNaN(seconds) || seconds < 0) {
            return '-';
        }

        seconds = Math.floor(seconds/1000);

        var minutes = Math.floor(seconds/60);
        seconds -= minutes * 60;

        return  pad0(minutes) + 'm' + pad0(seconds) + 's';
    }
    
    function formatDate(ts) {
        var tsOptions = { year: 'numeric', month: 'numeric', day: 'numeric',
                          hour: 'numeric', minute: 'numeric', second: 'numeric',
                          hour12: false, timeZoneName: 'short'};
        var d = (ts)?(new Date(ts)):(new Date());
        if (cbLocalTime.checked) {
        } else {
            tsOptions.timeZone = 'UTC';
        }
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }
    
    function formatTime(ts) {
        var tsOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric',
                          hour12: false};
        var d = (ts)?(new Date(ts)):(new Date());
        if (cbLocalTime.checked) {
        } else {
            tsOptions.timeZone = 'UTC';
        }
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }
    
    function addTableCommandLine(r) {
        r.tableLines.unshift(
            "<tr>"
                + "<td>" + formatDate(r.lastCommand.request.ts) + "</td>" 
                + '<td colspan="3">Command @' + formatTime() + "</td>" 
                + '<td colspan="16">Actions:' + printLastCommand(r.lastCommand.request.actions) + "</td>" 
                + "</tr>");
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function makeTableLine (r) {

        function isDifferingSpeed (speed) {
            return Math.abs(1 - r.curr.speed / speed) > 0.01;
        }

        function isCurrent(timestamp) {
            return (timestamp && (timestamp > r.prev.lastCalcDate) );
        }
        
        function getBG (timestamp) {
            return isCurrent(timestamp)?('style="background-color: ' + LightRed + ';"'):'';
        }

        function isPenalty () {
            return isCurrent(r.curr.tsEndOfSailChange)
                ||isCurrent(r.curr.tsEndOfGybe)
                ||isCurrent(r.curr.tsEndOfTack);
        }
        
        var speedCStyle = '';
        var speedTStyle = '';
        var deltaDist = roundTo(r.curr.deltaD, 3);
        var speedT = '-';
        if ( r.curr.speedT ) {
            speedT = r.curr.speedT.speed + '&nbsp;(' + r.curr.speedT.sail + ')';
        }
        
        if ( isPenalty() ) {
            speedCStyle = 'style="background-color: ' + LightRed + ';"';
        } else if ( isDifferingSpeed(r.curr.speedC) ) {
            speedCStyle = 'style="background-color: yellow;"';
        } else if ( isDifferingSpeed(r.curr.speedT.speed) ) {
            // Speed differs but not due to penalty - assume 'Bad Sail' and display theoretical delta
            speedTStyle = 'style="background-color: ' + LightRed + ';"';
            deltaDist = deltaDist + ' (' +  roundTo(r.curr.deltaD_T, 3) + ')';
        }
        
        var sailChange = formatSeconds(r.curr.tsEndOfSailChange - r.curr.lastCalcDate);
        var gybing = formatSeconds(r.curr.tsEndOfGybe - r.curr.lastCalcDate);
        var tacking = formatSeconds(r.curr.tsEndOfTack - r.curr.lastCalcDate);

        return "<tr>"
            + "<td>" + formatDate(r.curr.lastCalcDate) + "</td>"
            + commonTableLines(r) 
            + "<td>" + roundTo(r.curr.speed, 2) + "</td>"
            + "<td " + speedCStyle + ">" + roundTo(r.curr.speedC, 2) + "</td>"
            + "<td " + speedTStyle + ">" + speedT + "</td>"
            + "<td " + speedTStyle + ">" + deltaDist + "</td>"
            + "<td>" + roundTo(r.curr.deltaT, 0) + "</td>"
            + "<td " + getBG(r.curr.tsEndOfSailChange) + ">" + sailChange + "</td>"
            + "<td " + getBG(r.curr.tsEndOfGybe) + ">" + gybing + "</td>"
            + "<td " + getBG(r.curr.tsEndOfTack) + ">" + tacking + "</td>"
            + "</tr>";
    }

    function saveMessage (r) {
        var newRow = makeTableLine(r);
        r.tableLines.unshift(newRow);
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function changeRace(race) {
        if (typeof race === "object") { // select event
            race = this.value;
        }
        divRaceStatus.innerHTML = makeRaceStatusHTML();
        divRecordLog.innerHTML = makeTableHTML(races.get(race));
        divFriendList.innerHTML = makeFriendsHTML(racefriends.get(race));
    }

    function getRaceLegId (id) {
        // work around for certain messages (Game_GetOpponents)
        if(id.raceId) {
            return id.raceId + '.' + id.legNum;
        } else {
            return id.race_id + '.' + id.leg_num;
        }
    }
    
    function legId (legInfo) {
        return legInfo.raceId + '.' + legInfo.legNum;
    }

    function clearLog() {
        divRawLog.innerHTML = "";
    }

    function tableClick(ev) {
        var call_rt = false;
        var friend=false;
    var tabsel=false;
        var rmatch;
        var re_rttd = new RegExp("^rt:(.+)");
        var re_rsel = new RegExp("^rs:(.+)");
        var re_usel = new RegExp("^ui:(.+)");
    var re_tsel = new RegExp("^ts:(.+)");

        for(var node = ev.target; node ; node = node.parentNode) {
            var id = node.id;
            var match;
            if(re_rttd.exec(id)) {
                call_rt = true;
            } else if(match = re_rsel.exec(id)) {
                rmatch = match[1];
            } else if(match = re_usel.exec(id)) {
                rmatch = match[1];
                friend=true;
            } else if(match = re_tsel.exec(id)) {
                rmatch = match[1];
        tabsel=true;
            }
        }
        if(rmatch) {
            if(tabsel) {
        // Tab-Selection
        document.getElementById("tab-content1").style.display = (rmatch == 1 ? 'block': 'none');
        document.getElementById("tab-content2").style.display = (rmatch == 2 ? 'block': 'none');
        document.getElementById("tab-content3").style.display = (rmatch == 3 ? 'block': 'none');
            } else if(friend){
        // Friend-Routing 
                if(call_rt) callUrl(selRace.value,rmatch);
            } else {
        // Race-Switching
                if(call_rt) callUrl(rmatch);
                enableRace(rmatch,true);
                changeRace(rmatch);
            }
        }
    }

    function enableRace(id,force) {
        for (var i = 0; i < selRace.options.length; i++) {
            if (selRace.options[i].value == id) {
                selRace.options[i].disabled = false;
                if (selRace.selectedIndex == -1 || force) {
                    selRace.selectedIndex = i;
                }
            }
        }
    }

    function renameRace(id, newname) {
        for (var i = 0; i < selRace.options.length; i++) {
            if (selRace.options[i].value == id) {
                selRace.options[i].text = newname;
            }
        }
    }

    function disableRaces() {
        for (var i = 0; i < selRace.options.length; i++) {
            selRace.options[i].disabled = true;
        }
        selRace.selectedIndex == -1;
    }
    
    function addRace(message) {
        var raceId = getRaceLegId(message._id);
        var race = { id: raceId, name: "Race #" + raceId, source: "tmp"};
        initRace(race, false);
        return race;
    }
    
    function updatePosition (message, r) {
        if (r === undefined) { // race not lsited
            r = addRace(message);
        }
        
        if (r.curr !== undefined && r.curr.lastCalcDate == message.lastCalcDate) { // repeated message
            return;
        }
        if (!r.curr) {
            enableRace(r.id);
        }
        r.prev = r.curr;
        r.curr = message;
        r.curr.speedT =  theoreticalSpeed(message);
        if ( r.prev != undefined ) {
            var d = gcDistance(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon);
            var delta = courseAngle(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon);
            var alpha = Math.PI - angle(toRad(r.prev.heading), delta);
            var beta = Math.PI - angle(toRad(r.curr.heading), delta);
            var gamma = angle(toRad(r.curr.heading), toRad(r.prev.heading));
            // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
            r.curr.deltaT = (r.curr.lastCalcDate - r.prev.lastCalcDate)/1000;
            if ( r.curr.deltaT > 0
                 && Math.abs(toDeg(gamma)-180) > 1
                 && toDeg(alpha) > 1
                 && toDeg(beta) > 1 ) {
                r.curr.deltaD = d / Math.sin(gamma) * (Math.sin(beta) +  Math.sin(alpha));
            } else {
                r.curr.deltaD = d;
            }
            r.curr.speedC = Math.abs(roundTo(r.curr.deltaD/r.curr.deltaT * 3600, 2));
            // deltaD_T = Delta distance computed from speedT is only displayed when it deviates
            if ( r.curr.speedT ) {
                r.curr.deltaD_T = r.curr.deltaD /  r.curr.speedC * r.curr.speedT.speed;
            }

            saveMessage(r);
        }
        divRaceStatus.innerHTML = makeRaceStatusHTML();
    }

    function angle (h0, h1) {
        return Math.abs(Math.PI - Math.abs(h1 - h0));
    }
    
    function theoreticalSpeed (message) {
        var shortNames = {
            "JIB" : "Jib",
            "SPI" : "Spi",
            "STAYSAIL" : "Stay",
            "LIGHT_JIB" : "LJ",
            "CODE_0" : "C0",
            "HEAVY_GNK" : "HG",
            "LIGHT_GNK" : "LG"
        }

        var boatPolars = polars[message.boat.polar_id];
        if ( boatPolars == undefined || message.options == undefined || message.tws == undefined) {
            return undefined;
        } else {
            var tws = message.tws;
            var twd = message.twd;
            var twa = message.twa;
            var options = message.options;
            var foil = foilingFactor(options, tws, twa, boatPolars.foil);
            var hull = options.includes("hull")?1.003:1.0;
            var twsLookup = fractionStep(tws, boatPolars.tws);
            var twaLookup = fractionStep(twa, boatPolars.twa);
            var speed = maxSpeed(options, twsLookup, twaLookup, boatPolars.sail);
            return {"speed": roundTo(speed.speed * foil * hull, 2), "sail": shortNames[speed.sail]};
        }
    }

    function maxSpeed (options, iS, iA, sailDefs) {
        var maxSpeed = 0;
        var maxSail = "";
        for (const sailDef of sailDefs) {
            if ( sailDef.name === "JIB"
                 || sailDef.name === "SPI"
                 || (sailDef.name === "STAYSAIL" && options.includes("heavy"))
                 || (sailDef.name === "LIGHT_JIB" && options.includes("light"))
                 || (sailDef.name === "CODE_0" && options.includes("reach"))
                 || (sailDef.name === "HEAVY_GNK" && options.includes("heavy"))
                 || (sailDef.name === "LIGHT_GNK" && options.includes("light")) ) {
                var speeds = sailDef.speed;
                var speed = bilinear(iA.fraction, iS.fraction,
                                     speeds[iA.index - 1][iS.index - 1],
                                     speeds[iA.index][iS.index - 1],
                                     speeds[iA.index - 1][iS.index],
                                     speeds[iA.index][iS.index]);
                if ( speed > maxSpeed ) {
                    maxSpeed = speed;
                    maxSail = sailDef.name;
                }
            }
        }
        return {
            speed: maxSpeed,
            sail: maxSail
        }
    }

    function bilinear (x, y, f00, f10, f01, f11) {
        return f00 * (1 - x) * (1 - y)
            + f10 * x * (1 - y)
            + f01 * (1 - x) * y
            + f11 * x * y;
    }

    function foilingFactor (options, tws, twa, foil) {
        var speedSteps = [0, foil.twsMin - foil.twsMerge, foil.twsMin, foil.twsMax,  foil.twsMax + foil.twsMerge, Infinity];
        var twaSteps = [0, foil.twaMin - foil.twaMerge, foil.twaMin, foil.twaMax,  foil.twaMax + foil.twaMerge, Infinity];
        var foilMat = [[1, 1, 1, 1, 1, 1],
                       [1, 1, 1, 1, 1, 1],
                       [1, 1, foil.speedRatio, foil.speedRatio, 1, 1],
                       [1, 1, foil.speedRatio, foil.speedRatio, 1, 1],
                       [1, 1, 1, 1, 1, 1],
                       [1, 1, 1, 1, 1, 1]];
        
        if ( options.includes("foil") ) {
            var iS = fractionStep(tws, speedSteps);
            var iA = fractionStep(twa, twaSteps);
            return  bilinear(iA.fraction, iS.fraction,
                             foilMat[iA.index - 1][iS.index - 1],
                             foilMat[iA.index][iS.index - 1],
                             foilMat[iA.index - 1][iS.index],
                             foilMat[iA.index][iS.index]);
        } else {
            return 1.0;
        }
    }
    
    function fractionStep (value, steps) {
        var absVal = Math.abs(value);
        var index = 0;
        while ( index < steps.length && steps[index]<= absVal ) {
            index++;
        }
        return {
            index: index,
            fraction: (absVal - steps[index-1]) / (steps[index] - steps[index-1])
        }
    }
    
    function callUrlZezo (raceId, userId, beta) {
        var optionBits = { "foil" : 16, "winch" : 4, "reach": 64, "heavy":128, "light" : 32 }; 

        var baseURL = 'http://zezo.org';
        var r = races.get(raceId);
        var uinfo;

        if(userId) {
            uinfo = racefriends.get(raceId).uinfo[userId];
            if(uinfo === undefined) {
                alert("Can't find record for user id " + userId);
                return;
            }
        }

        var options = 0;
        for (var key in r.curr.options) {
            if (optionBits[r.curr.options[key]]) {
                options |= optionBits[r.curr.options[key]];
            }
        }

        if (!r.url) {
            // Panic - check if the race_id part is known.
            // In the unlikely case when the polars change from one leg to another,
            // this will give surprising results...
            var race_id = Number(raceId.split('.')[0]);
            var race = races.get(race_id);
            r.url = race.url;
        }

        if (!r.url) {
            alert('Unknown race - no routing available');
        } else {
            var urlBeta = r.url + (beta?"b":"");
            var pos = r.curr.pos;
            var twa = r.curr.twa;
            var uid = r.curr._id.user_id;
            var type = "me";

            if(uinfo) {
                pos = uinfo.pos;
                twa = uinfo.twa;
                uid = userId;
                options = 0;
                type = "friend";
            }
            var url = baseURL + '/' + urlBeta + '/chart.pl?lat=' + pos.lat + '&lon=' + pos.lon +
                '&options=' + options + '&twa=' + twa + '&userid=' + uid + '&type=' + type;
            window.open(url, cbReuseTab.checked?urlBeta:'_blank');
        }
    }
    
    // Greate circle distance in meters
    function gcDistance (lat0, lon0, lat1, lon1) {
        // e = r · arccos(sin(φA) · sin(φB) + cos(φA) · cos(φB) · cos(λB – λA))
        var rlat0 = toRad(lat0);
        var rlat1 = toRad(lat1);
        var rlon0 = toRad(lon0);
        var rlon1 = toRad(lon1);
        return radius * gcAngle(rlat0, rlon0, rlat1, rlon1);
    }

    function gcAngle(rlat0, rlon0, rlat1, rlon1) {
        return Math.acos(Math.sin(rlat0) * Math.sin(rlat1)
                         + Math.cos(rlat0) * Math.cos(rlat1) * Math.cos(rlon1 - rlon0));

    }

    function courseAngle(lat0, lon0, lat1, lon1) {
        var rlat0 = toRad(lat0);
        var rlat1 = toRad(lat1);
        var rlon0 = toRad(lon0);
        var rlon1 = toRad(lon1);
        var xi = gcAngle(rlat0, rlon0, rlat1, rlon1);
        var a = Math.acos((Math.sin(rlat1) - Math.sin(rlat0) * Math.cos(xi))
                          / (Math.cos(rlat0) * Math.sin(xi)));
        return (Math.sin(rlon1-rlon0)>0)?a:(2*Math.PI-a);
    }

    function toRad (angle) {
        return angle / 180 * Math.PI;
    }

    function toDeg (angle) {
        return angle / Math.PI * 180;
    }
    
    function toDMS (number) {
        var u = sign(number);
        number = Math.abs(number);
        var g = Math.floor(number);
        var frac = number - g;
        var m = Math.floor(frac * 60);
        frac = frac - m/60;
        var s = Math.floor(frac * 3600);
        var cs = roundTo(360000 * (frac - s/3600), 0);
        while ( cs >= 100 ) {
            cs = cs - 100;
            s = s + 1;
        }
        return {"u":u, "g":g, "m":m, "s":s, "cs":cs};
    }
    
    function roundTo (number, digits) {
        if (number !== undefined && !isNaN(number)) {
            var scale = Math.pow(10, digits);
            return Math.round(number * scale) / scale;
        } else {
            return '-';
        }
    }

    function sign (x) {
        return (x < 0)? -1: 1;
    }

    function pad0(val) {
        if (val < 10) {
            val = "0" + val;
        }
        return val;
    }

    function formatPosition (lat, lon) {
        var latDMS = toDMS(lat);
        var lonDMS = toDMS(lon);
        var latString = latDMS.g + "°" + pad0(latDMS.m) + "'" + pad0(latDMS.s) + '"';
        var lonString = lonDMS.g + "°" + pad0(lonDMS.m) + "'" + pad0(lonDMS.s) + '"';
        return  latString + ((latDMS.u==1)?'N':'S') + ' ' + lonString + ((lonDMS.u==1)?'E':'W');
    }

    function saveOption(e) {
        localStorage["cb_" + this.id] = this.checked;
    }

    function getOption(name) {
        var value = localStorage["cb_" + name];
        if (value !== undefined) {
            cb = document.getElementById(name).checked = (value === "true");
        }
    }

    function readOptions() {
        getOption("auto_router");
        getOption("reuse_tab");
        getOption("local_time");
    }
    
    function addConfigListeners() {
        cbRouter.addEventListener("change",saveOption);
        cbReuseTab.addEventListener("change",saveOption);
        cbLocalTime.addEventListener("change",saveOption);
    }
    
    var initialize = function () {
        var manifest = chrome.runtime.getManifest();
        document.getElementById("lb_version").innerHTML = manifest.version;

        lbBoatname = document.getElementById("lb_boatname");
        selRace = document.getElementById("sel_race");
        cbRouter = document.getElementById("auto_router");
        cbReuseTab = document.getElementById("reuse_tab");
        cbLocalTime = document.getElementById("local_time");
        lbRace = document.getElementById("lb_race");
        lbCurTime = document.getElementById("lb_curtime");
        lbCurPos = document.getElementById("lb_curpos");
        lbHeading = document.getElementById("lb_heading");
        lbTWS = document.getElementById("lb_tws");
        lbTWD = document.getElementById("lb_twd");
        lbTWA = document.getElementById("lb_twa");
        lbDeltaD = document.getElementById("lb_delta_d");
        lbDeltaT = document.getElementById("lb_delta_t");
        lbSpeedC = document.getElementById("lb_curspeed_computed");
        lbSpeedR = document.getElementById("lb_curspeed_reported");
        lbSpeedT = document.getElementById("lb_curspeed_theoretical");
        divRaceStatus = document.getElementById("raceStatus");
        divRecordLog = document.getElementById("recordlog");
        divRecordLog.innerHTML = makeTableHTML();
        cbRawLog =  document.getElementById("cb_rawlog");
        divRawLog = document.getElementById("rawlog");
        callUrlFunction = callUrlZezo;
        initRaces();
        
        chrome.storage.local.get("polars", function(items) {
            if (items["polars"] !== undefined) {
                console.log("Retrieved " + items["polars"].filter(function(value) { return value != null }).length + " polars."); 
                polars = items["polars"];
            }
        });

        initialized = true;
    }
    
    var callUrl = function (raceId, userId) {
        var beta = false;

        if (typeof raceId === "object") { // button event
            raceId = selRace.value;
            beta = selRace.options[selRace.selectedIndex].betaflag;
        } else { // new tab
            var race = selRace.options[selRace.selectedIndex];
            if (race && race.value == raceId) {
                beta = race.betaflag;
            }
        }

        if ( !races.get(raceId) ) {
            alert('Unsupported race #' + raceId);
        } else if ( races.get(raceId).curr === undefined ) {
            alert('No position received yet. Please retry later.');
        } else if ( races.get(raceId).url === undefined ) {
            alert('Unsupported race, no router support yet.');
        } else if ( callUrlFunction === undefined ) {
            // ?
        } else {
            callUrlFunction(raceId, userId, beta);
        }
    }

    function reInitUI (newId) {
        if ( currentUserId != undefined && currentUserId != newId ) {
            // Re-initialize statistics
            disableRaces();
            races.forEach(function (race) {
                race.tableLines = [];
                race.curr = undefined;
                race.prev = undefined;
                race.lastCommand = undefined;
                race.rank = undefined;
                race.dtl = undefined;
            });
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            divRecordLog.innerHTML = makeTableHTML();
            divFriendList.innerHTML = makeFriendsHTML();
        };
    }
    

    var onEvent = function (debuggeeId, message, params) {
        if ( tabId != debuggeeId.tabId )
            return;

        if ( message == "Network.webSocketFrameSent" ) {
            // Append message to raw log
            if ( cbRawLog.checked ) {
                divRawLog.innerHTML = divRawLog.innerHTML + '\n' + '>>> ' + params.response.payloadData;
            }

            // Map to request type via requestId
            var request = JSON.parse(params.response.payloadData);
            requests.set(request.requestId, request);

            if ( request.eventKey == "Game_StartAttempt" ) {
                var raceId = getRaceLegId(request);
                var race = races.get(raceId);
                if (race) {
                    race.prev = undefined;
                    race.curr = undefined;
                }
            }
            
        } else if ( message == "Network.webSocketFrameReceived" ) {
            // Append message to raw log
            if ( cbRawLog.checked ) {
                divRawLog.innerHTML = divRawLog.innerHTML + '\n' +  '<<< ' + params.response.payloadData;
            }
            // Work around broken message
            var jsonString = params.response.payloadData.replace(/\bNaN\b/g, "null");
            var response = JSON.parse(jsonString);
            if ( response == undefined ) {
                console.log("Invalid JSON in payload");
            } else {
                var responseClass = response["@class"];
                if ( responseClass == ".AccountDetailsResponse" ) {
                    reInitUI(response.userId);
                    currentUserId = response.userId;
                    lbBoatname.innerHTML = response.displayName;
                } else if ( responseClass == ".LogEventResponse" ) {
                    // Get the matching request and Dispatch on request type
                    var request = requests.get(response.requestId);
                    
                    // Dispatch on request type                 
                    if ( request == undefined ) {
                        // Probably only when debugging.
                        // -- save and process later?
                        console.warn(responseClass + " " + response.requestId + " not found");
                    } else if ((request.eventKey == "LDB_GetLegRank" || 
                                request.eventKey == "LDB_GetGateRank") && 
                               response.scriptData.me !== null) {
                        // Use this response to update User/Boat info if the plugin is switched on while already logged in
                        reInitUI(response.scriptData.me._id );
                        currentUserId = response.scriptData.me._id;
                        lbBoatname.innerHTML = response.scriptData.me.displayName;
                        // Retrieve rank in current race
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        if ( race != undefined ) {
                            race.rank = response.scriptData.me.rank;
                            race.dtl = roundTo(response.scriptData.me.distance - response.scriptData.res[0].distance,2);
                            divRaceStatus.innerHTML = makeRaceStatusHTML();
                        }
                    } else if ( request.eventKey == "Leg_GetList" ) {
                        // Contains destination coords, ice limits
                        // ToDo: contains Bad Sail warnings. Show in race status table?
                        var legInfos = response.scriptData.res;
                        legInfos.map(function (legInfo) {
                            var rid = legId(legInfo);
                            var race = races.get(rid);
                            if ( race === undefined ) { 
                                race = { id: rid, name: legInfo.legName, legName: legInfo.legName, source: "vr_leglist" };
                                initRace(race, true);
                            } else {
                                race.legName = legInfo.legName; // no name yet (created by updatePosition)
                                // renameRace(rid, race.name);
                            }
                            race.rank = legInfo.rank;
                            race.type = legInfo.raceType; 
                            race.legnum = legInfo.legNum; 
                            race.status = legInfo.status; 
                            race.record = legInfo.record; 
                            if ( legInfo.problem == "badSail" ) {
                            } else if ( legInfo.problem == "..." ) {
                            }
                        });
                        divRaceStatus.innerHTML = makeRaceStatusHTML();
                    } else if ( request.eventKey == "Game_GetBoatState" ) {
                        // First boat state message, only sent for the race the UI is displaying
                        var raceId = getRaceLegId(response.scriptData.boatState._id);
                        var race =  races.get(raceId);
                        // Don't try old race_id, messages will be misdirected
                        updatePosition(response.scriptData.boatState, race);
                        if (cbRouter.checked) {
                            callUrl(raceId);
                        }
                    } else if ( request.eventKey == "Game_RefreshBoatState" ) {
                        // New message - does this replace the boatStatePush? 
                        var raceId = getRaceLegId(response.scriptData.boatState._id);
                        var race =  races.get(raceId);
                        // Don't try old race_id, messages will be misdirected
                        updatePosition(response.scriptData.boatState, race);
                    } else if ( request.eventKey == "Game_AddBoatAction" ) {
                        // First boat state message, only sent for the race the UI is displaying
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        if ( race != undefined ) {
                            race.lastCommand = {request: request, rc: response.scriptData.rc};
                            addTableCommandLine(race);
                            divRaceStatus.innerHTML = makeRaceStatusHTML();
                        }
                    } else if ( request.eventKey == "Meta_GetPolar" ) {
                        if ( polars[response.scriptData.polar._id] == undefined ) {
                            polars[response.scriptData.polar._id] = response.scriptData.polar;
                            chrome.storage.local.set({"polars": polars});
                            console.info("Stored new polars " + response.scriptData.polar.label);
                        } else {
                            console.info("Known polars " + response.scriptData.polar.label);
                        }
                    } else if ( request.eventKey == "Shop_GetCardsPack" ) {
                        var card = races.get(getRaceLegId(request)).curr.soloCard;
                        card.code = response.scriptData.packs[0].code;
                        card.ts = response.scriptData.tsSoloCard;
                        divRaceStatus.innerHTML = makeRaceStatusHTML();
                    } else if ( request.eventKey == "Game_GetFollowedBoats") {
                        var raceId = getRaceLegId(request);
                        updateFriends(raceId, "followed", response.scriptData.res);
                        if(raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    } else if ( request.eventKey == "Game_GetOpponents" ) {
                        var raceId = getRaceLegId(request);
                        updateFriends(raceId, "opponents", response.scriptData.res);
                        if(raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    } else if ( request.eventKey == "User_GetCard" ) {
                        var raceId = getRaceLegId(request);
                        var uid = request.user_id;
                        response.scriptData.legInfos.baseInfos = response.scriptData.baseInfos; // tweak record
                        updateFriendUinfo(raceId, "usercard", uid, response.scriptData.legInfos);
                        if(raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    }
                } else if ( responseClass == ".ScriptMessage" ) {
                    // There is no request for .ScriptMessages.
                    // The only ScriptMessage type is extCode=boatStatePush
                    var raceId = getRaceLegId(response.data._id);
                    var race =  races.get(raceId);
                    updatePosition(response.data, race);
                }
            }
        }
    }

    return {
        // The only point of initialize is to wait until the document is constructed.
        initialize: initialize,
        // Useful functions
        callUrl: callUrl,
        changeRace: changeRace,
        onEvent: onEvent,
        clearLog: clearLog,
        tableClick: tableClick,
        readOptions: readOptions,
        addConfigListeners: addConfigListeners
    }
} ();


var tabId = parseInt(window.location.search.substring(1));


window.addEventListener("load", function() {

    controller.initialize();
    
    document.getElementById("bt_callurl").addEventListener("click", controller.callUrl);
    document.getElementById("sel_race").addEventListener("change", controller.changeRace);
    document.getElementById("bt_clear").addEventListener("click", controller.clearLog);
    document.addEventListener("click", controller.tableClick);

    controller.readOptions();
    controller.addConfigListeners();
    
    chrome.debugger.sendCommand({tabId:tabId}, "Network.enable", function() {
        // just close the dashboard window if debugger attach fails
        // wodks on session restore too
        
        if (chrome.runtime.lastError) {
            window.close();
            return;
        }
    });
    chrome.debugger.onEvent.addListener(controller.onEvent);
});

window.addEventListener("unload", function() {
    chrome.debugger.detach({tabId:tabId});
});
