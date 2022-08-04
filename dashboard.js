// UI Controller

import * as Util from './util.js';
import * as NMEA from './nmea.js';

( function () {

    var tabId = parseInt(window.location.search.substring(1));

    // Events:
    var ignoredMessages = [
        "Ad_getInterstitial",
        "Ad_GetPOIs",
        "Game_SaveLastRank",
        "Game_GetWeather",
        "Game_GetSettings",
        "Meta_GetMapInfo",
        "Meta_GetCountries",
        "Leg_GetHistory",
        "Shop_GetPacks",
        "Shop_GetSubscriptions",
        "Social_GetCommunityMessages",
        "Social_getVRmsg",
        "Social_GetPlayers",
        "Social_GetNbUnread",
        "Team_Get",
        "User_GetInfos"];
    var handledMessages = [
        ".AccountDetailsResponse",
        "getboatinfos",
        "getfleet",
        "Game_GetGhostTrack",
        "Game_AddBoatAction",
        "Leg_GetList",
        "Meta_GetPolar",
        "User_GetCard"];

    const LightRed = '#FFA0A0';

    var xhrMap = new Map();

    var currentCycle = 0;

    // ToDo: clear stats if user/boat changes
    var currentUserId, currentTeam;
    var requests = new Map();

    // Polars and other game parameters, indexed by polar._id
    var polars = [];

    var races = new Map();
    var raceFleetMap = new Map();

    var showMarkers = new Map();

    var sortField = "none";
    var currentSortField = "none";
    var currentSortOrder = 0;
    const sailNames = [0, "Jib", "Spi", "Stay", "LJ", "C0", "HG", "LG", 8, 9,
                     // VR sends sailNo + 10 to indicate autoSail. We use sailNo mod 10 to find the sail name sans Auto indication.
                     "Auto", "Jib (Auto)", "Spi (Auto)", "Stay (Auto)", "LJ (Auto)", "C0 (Auto)", "HG (Auto)", "LG (Auto)"];

    const category = ["real", "certified", "top", "sponsor", "normal", "pilotBoat"];
    const categoryStyle = [
        // real
        {nameStyle: "color: DarkGreen;", bcolor: 'DarkGreen'},
        // certified
        {nameStyle: "color: Navy;", bcolor: 'Navy'},
        // top
        {nameStyle: "color: DarkGoldenRod;", bcolor: 'DarkGoldenRod'},
        // "sponsor"
        {nameStyle: "color: BlueViolet;", bcolor: 'BlueViolet'},
        // "normal"
        {nameStyle: "color: #2020AA;", bcolor: '#2020AA'},
        // "normal"
        {nameStyle: "color: #2020AA;", bcolor: '#2020AA'}
    ];

    function isShowMarkers (userId) {
        if (showMarkers.get(userId) == undefined) {
            showMarkers.set(userId, true);
        }
        return showMarkers.get(userId);
    }

    function addSelOption (race, beta, disabled) {
        var option = document.createElement("option");
        option.text = race.name + (beta ? " beta" : "") + " (" + race.id.substr(0, 3) + ")";
        option.value = race.id;
        option.betaflag = beta;
        option.disabled = disabled;
        selRace.appendChild(option);
    }

    function initRace (race, disabled) {
        race.tableLines = [];
        races.set(race.id, race);
        var fleetData = new Map();
        fleetData.table = new Array();
        fleetData.uinfo = new Object();
        raceFleetMap.set(race.id, fleetData);
        addSelOption(race, false, disabled);
        if (race.has_beta) {
            addSelOption(race, true, disabled);
        }
    }

    function initRaces () {
        var xhr = new XMLHttpRequest();
        xhr.onload = function () {
            var json = xhr.responseText;
            json = JSON.parse(json);
            for (var i = 0; i < json.races.length; i++) {
                console.log("Race: " + JSON.stringify(json.races[i]));
                json.races[i].source = "zezo";
                initRace(json.races[i], true);
            }
            divRaceStatus = document.getElementById("raceStatus");
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            divFriendList = document.getElementById("friendList");
            divFriendList.innerHTML = "No boats positions received yet";
        }
        xhr.open("GET", "http://zezo.org/races2.json");
        //xhr.open("GET", "races2.json");
        xhr.send();
    }

    var selRace, selNmeaport, selFriends;
    var cbFriends, cbOpponents, cbCertified, cbTeam, cbTop, cbReals, cbSponsors, cbInRace, cbRouter, cbReuseTab, cbMarkers, cbLocalTime, cbRawLog, cbNMEAOutput;
    var lbBoatname, lbTeamname, lbRace, lbCycle, lbCurTime, lbCurPos, lbHeading, lbTWS, lbTWD, lbTWA, lbDeltaD, lbDeltaT, lbSpeedC, lbSpeedR, lbSpeedT;
    var divPositionInfo, divRaceStatus, divRecordLog, divFriendList, divRawLog;

    var initialized = false;

    var tableHeader = '<tr>'
        + commonHeaders()
        + '<th title="Reported speed">' + "vR (kn)" + '</th>'
        + '<th title="Calculated speed (Δd/Δt)">' + "vC (kn)" + '</th>'
        + '<th title="Polar-derived speed">' + "vT (kn)" + '</th>'
        + '<th title="Foiling factor">' + "Foils" + '</th>'
        + '<th title="Calculated distance">' + "Δd (nm)" + '</th>'
        + '<th title="Time between positions">' + "Δt (s)" + '</th>'
        + '<th title="Sail change time remaining">' + "Sail" + '</th>'
        + '<th title="Gybing time remaining">' + "Gybe" + '</th>'
        + '<th title="Tacking time remaining">' + "Tack" + '</th>'
        + '</tr>';

    var raceStatusHeader = '<tr>'
        + '<th title="Call Router">' + "RT" + '</th>'
        + '<th title="Call Polars">' + "PL" + '</th>'
        + '<th title="Call WindInfo">' + "WI" + '</th>'
        + '<th>' + "Race" + '</th>'
        + commonHeaders()
        + '<th title="Boat speed">' + "Speed" + '</th>'
        + '<th>' + "VMG" + '</th>'
        + '<th>' + "Up" + '</th>'
        + '<th>' + "Down" + '</th>'
        + '<th title="Tacking penalty incl. stamina factor">' + "Tack" + '</th>'
        + '<th title="Gybing penalty incl. stamina factor">' + "Gybe" + '</th>'
        + '<th title="Sail change penalty incl. stamina factor">' + "Sail" + '</th>'
        + '<th>' + "Options" + '</th>'
        + '<th title="Boat is aground">' + "Agnd" + '</th>'
        + '<th title="Boat is maneuvering, half speed">' + "Mnvr" + '</th>'
        + '<th>' + "Last Command" + '</th>'
        + '</tr>';

    function friendListHeader () {
        return '<tr>'
            + genth("th_rt", "RT", "Call Router", sortField == "none", undefined)
            + genth("th_name", "Skipper", undefined, sortField == "displayName", currentSortOrder)
            + recordRaceColumns()
            + genth("th_lu", "Last Update", undefined, sortField == "lastCalcDate", currentSortOrder)
            + genth("th_rank", "Rank", undefined, sortField == "rank", currentSortOrder)
            + genth("th_dtf", "DTF", "Distance to Finish", sortField == "dtf", currentSortOrder)
            + genth("th_dtu", "DTU", "Distance to Us", sortField == "distanceToUs", currentSortOrder)
            + genth("th_brg", "BRG", "Bearing from Us", undefined)
            + genth("th_sail", "Sail", undefined, sortField == "sail", currentSortOrder)
            + genth("th_state", "State", undefined, sortField == "state", currentSortOrder)
            + genth("th_psn", "Position", undefined)
            + genth("th_hdg", "HDG", "Heading", sortField == "heading", currentSortOrder)
            + genth("th_twa", "TWA", "True Wind Angle", sortField == "twa", currentSortOrder)
            + genth("th_tws", "TWS", "True Wind Speed", sortField == "tws", currentSortOrder)
            + genth("th_speed", "Speed", "Boat Speed", sortField == "speed", currentSortOrder)
            + genth("th_factor", "Factor", "Speed factor over no-options boat", undefined)
            + genth("th_foils", "Foils", "Foiling percentage", undefined)
            + genth("th_options", "Options", "Options accordng to user card", sortField == "xoption_options", currentSortOrder)
            + '</tr>';
    }

    function recordRaceColumns () {
        var race = races.get(selRace.value);
        if (race.type === "record") {
            return genth("th_sd","Start Date",undefined, sortField == "startDate", currentSortOrder)
                + genth("th_ert","ERT", "Estimated Total Race Time", sortField == "eRT", currentSortOrder)
                + genth("th_avgspeed","avgS", "Average Speed", sortField == "avgSpeed", currentSortOrder);
        } else {
            return "";
        }
    }

    function genth (id, content, title, sortfield, sortmark, hidden) {
        if (sortfield && sortmark != undefined) {
            content = content + " " + (sortmark ? "&#x25b2;" : "&#x25bc;");
        }
        return '<th ' + '' + 'id="' + id + '"'
            + (sortfield ? ' style="background: DarkBlue;"' : "")
            + (title ? (' title="' + title + '"') : "")
            + '>' + content + '</th>';
    }

    function commonHeaders () {
        return '<th>' + "Time" + '</th>'
            + '<th>' + "Rank" + '</th>'
            + '<th title="Stamina and resulting penalty time factor">' + "Stamina" + '</th>'
            + '<th title="Distance To Leader">' + "DTL" + '</th>'
            + '<th title="Distance To Finish">' + "DTF" + '</th>'
            + '<th>' + "Position" + '</th>'
            + '<th title="Heading">' + "HDG" + '</th>'
            + '<th title="True Wind Angle">' + "TWA" + '</th>'
            + '<th title="True Wind Speed">' + "TWS" + '</th>'
            + '<th title="True Wind Direction">' + "TWD" + '</th>'
            + '<th title="Auto Sail time remaining">' + "aSail" + '</th>';
    }

    function printLastCommand (lcActions) {
        var lastCommand = "";

        lcActions.map(function (action) {
            if (action.type == "heading") {
                lastCommand += (action.autoTwa ? " TWA" : " HDG") + "=" + Util.roundTo(action.value, 3);
            } else if (action.type == "sail") {
                lastCommand += " Sail=" + sailNames[action.value];
            } else if (action.type == "prog") {
                action.values.map(function (progCmd) {
                    var progTime = formatDate(progCmd.ts);
                    lastCommand += (progCmd.autoTwa ? " TWA" : " HDG") + "=" + Util.roundTo(progCmd.heading, 3) + " @ " + progTime + "; ";
                });
            } else if (action.type == "wp") {
                action.values.map(function (waypoint) {
                    lastCommand += " WP: " + Util.formatPosition(waypoint.lat, waypoint.lon) + "; ";
                });
            }
        });
        return lastCommand;
    }

    function commonTableLines (r) {
        var sailInfo = sailNames[r.curr.sail % 10];

        var isAutoSail = r.curr.hasPermanentAutoSails ||
            (r.curr.tsEndOfAutoSail &&(r.curr.tsEndOfAutoSail - r.curr.lastCalcDate) > 0);
        var autoSailTime = r.curr.hasPermanentAutoSails ? '∞':Util.formatHMS(r.curr.tsEndOfAutoSail - r.curr.lastCalcDate);
        if (isAutoSail) {
            sailInfo = sailInfo + " (A " + autoSailTime + ")";
        } else {
            sailInfo = sailInfo + " (Man)";
        }

        // Remember when this message was received ...
        if (! r.curr.receivedTS) {
            r.curr.receivedTS = new Date();
        }
        // ... so we can tell if lastCalcDate was outdated (by more than 15min) already when we received it.
        var lastCalcDelta = r.curr.receivedTS - r.curr.lastCalcDate;
        var lastCalcStyle = (lastCalcDelta > 900000) ?  'style="background-color: red"':'';

        var sailNameBG = r.curr.badSail ? LightRed : "lightgreen";


        // No need to infer TWA mode, except that we might want to factor in the last command
        var isTWAMode = r.curr.isRegulated;

        var twaFG = (r.curr.twa < 0) ? "red" : "green";
        var twaBold = isTWAMode ? "font-weight: bold;" : "";
        var hdgFG = isTWAMode ? "black" : "blue";
        var hdgBold = isTWAMode ? "font-weight: normal;" : "font-weight: bold;";

        return '<td ' + lastCalcStyle + '>' + formatDate(r.curr.lastCalcDate) + '</td>'
            + '<td>' + (r.rank ? r.rank : "-") + '</td>'
            + '<td>' + r.curr.stamina.toFixed() + '|' +  mfactor(r.curr.stamina).toFixed(1)
            + '<td>' + Util.roundTo(r.curr.distanceToEnd - r.bestDTF, 1) + '</td>'
            + '<td>' + Util.roundTo(r.curr.distanceToEnd, 1) + '</td>'
            + '<td>' + Util.formatPosition(r.curr.pos.lat, r.curr.pos.lon) + '</td>'
            + '<td style="color:' + hdgFG + ";" + hdgBold + '">' + Util.roundTo(r.curr.heading, 3) + '</td>'
            + '<td style="color:' + twaFG + ";" + twaBold + '">' + Util.roundTo(Math.abs(r.curr.twa), 3) + '</td>'
            + '<td>' + Util.roundTo(r.curr.tws, 2) + '</td>'
            + '<td>' + Util.roundTo(r.curr.twd, 1) + '</td>'
            + '<td style="background-color:' + sailNameBG + ';">' + sailInfo + '</td>';
    }

    function makeRaceStatusLine (pair) {
        var r = pair[1];
        if (r.curr == undefined) {
            return "";
        } else {
            var agroundBG = r.curr.aground ? LightRed : "lightgreen";
            var manoeuvering = (r.curr.tsEndOfSailChange > r.curr.lastCalcDate)
                || (r.curr.tsEndOfGybe > r.curr.lastCalcDate)
                || (r.curr.tsEndOfTack > r.curr.lastCalcDate);
            var lastCommand = "-";
            var lastCommandBG = "";
            if (r.lastCommand != undefined) {
                // ToDo: error handling; multiple commands; expiring?
                var lcTime = formatTime(r.lastCommand.request.ts);
                lastCommand = printLastCommand(r.lastCommand.request.actions);
                lastCommand = "T:" + lcTime + " Actions:" + lastCommand;
                if (r.lastCommand.rc != "ok") {
                    lastCommandBG = LightRed;
                }
            }


            var info = "-";
            if (r.type === "leg") {
                info = '<span>' + r.legName + '</span>';
            } else if (r.type === "record") {
                if (r.record) {
                    info = '<span>Record, Attempt ' + parseInt(r.record.attemptCounter) + '</span>';
                } else {
                    info = '<span>-</span>'
                }
            }
            if (r.record && r.record.lastRankingGateName) {
                info += '<br/><span>@ ' + r.record.lastRankingGateName + '</span>';
            }

            var trstyle = "hov";
            if (r.id === selRace.value) trstyle += " sel";
            var best = bestVMG(r.curr.tws, polars[r.curr.boat.polar_id], r.curr.options);
            var up = Util.roundTo(best.vmgUp, 2) + "@" + best.twaUp;
            var down =Util.roundTo(Math.abs(best.vmgDown), 2) + "@" + best.twaDown;

            var penalties = manoeuveringPenalties(r);
            var tack = penalties.tack.dist + "nm " + penalties.tack.time + "s";
            var gybe = penalties.gybe.dist + "nm " + penalties.gybe.time + "s";
            var sail = penalties.sail.dist + "nm " + penalties.sail.time + "s";

            return '<tr class="' + trstyle + '" id="rs:' + r.id + '">'
                + (r.url ? ('<td class="tdc"><span id="rt:' + r.id + '">&#x2388;</span></td>') : '<td>&nbsp;</td>')
                + '<td class="tdc"><span id="pl:' + r.id + '">&#x26F5;</span></td>'
                + '<td class="tdc"><span id="wi:' + r.id + '"><img class="icon" src="wind.svg"/></span></td>'
                + '<td>' + r.name + '</td>'
                + commonTableLines(r)
                + '<td>' + Util.roundTo(r.curr.speed, 2) + '</td>'
                + '<td>' + Util.roundTo(vmg(r.curr.speed, r.curr.twa), 2) + '</td>'
                + '<td>' + up + '</td>'
                + '<td>' + down + '</td>'
                + '<td>' + tack + '</td>'
                + '<td>' + gybe + '</td>'
                + '<td>' + sail + '</td>'
                + '<td>' + ((r.curr.options.length == 8) ? ("All") : r.curr.options.join(" ")) + '</td>'
                + '<td style="background-color:' + agroundBG + ';">' + (r.curr.aground ? "AGROUND" : "No") + '</td>'
                + '<td>' + (manoeuvering ? "Yes" : "No") + '</td>'
                + '<td style="background-color:' + lastCommandBG + ';">' + lastCommand + '</td>'
                + '</tr>';
        }
    }

    function manoeuveringPenalties (record) {
        var winch = polars[record.curr.boat.polar_id].winch;
        var tws = record.curr.tws;
        var speed = record.curr.speed;
        var options = record.curr.options;
        var fraction;
        if  ((winch.lws <= tws) && (tws <= winch.hws)) {
            fraction = (tws - winch.lws) / (winch.hws - winch.lws);
        } else if (tws < winch.lws) {
            fraction = 0;
        } else {
            fraction = 1;
        }
        return {
            "gybe" : penalty(speed, options, fraction, winch.gybe, record.curr.stamina),
            "tack" : penalty(speed, options, fraction, winch.tack, record.curr.stamina),
            "sail" : penalty(speed, options, fraction, winch.sailChange, record.curr.stamina)
        };
    }

    function mfactor (stamina) {
        // https://virtualregatta.zendesk.com/hc/en-us/articles/5402546102546-Energy-management
        return  2 - stamina/66.667;
    }
    
    function penalty (speed, options, fraction, spec, stamina) {
        if (options.indexOf("winch") >= 0) {
            spec = spec.pro;
        } else {
            spec = spec.std;
        }
        var time = mfactor(stamina) * (spec.lw.timer + (spec.hw.timer - spec.lw.timer) * fraction);
        var dist = speed * time / 3600;
        return {
            "time" : time.toFixed(),
            "dist" : (dist * (1- spec.lw.ratio)).toFixed(3)
        };
    }
    
    function vmg (speed, twa) {
        var r = Math.abs(Math.cos(twa / 180 * Math.PI));
        return speed * r;
    }

    function bestVMG (tws, polars, options) {
        var best = {"vmgUp": 0, "twaUp": 0, "vmgDown": 0, "twaDown": 0};
        var twaSteps = polars.twa;
        for (var twa = twaSteps[0]; twa < twaSteps[twaSteps.length-1]; twa++) {
            var speed = theoreticalSpeed(tws, twa, options, polars).speed;
            var vmg = speed * Math.cos(twa / 180 * Math.PI);
            if (vmg > best.vmgUp) {
                best.twaUp = twa;
                best.vmgUp = vmg;
            } else if (vmg < best.vmgDown) {
                best.twaDown = twa;
                best.vmgDown = vmg;
            }
        }
        return  best;
    }

    function boatinfo (uid, uinfo) {
        var res = {
            name: uinfo.displayName,
            speed: uinfo.speed,
            heading: uinfo.heading,
            tws: uinfo.tws,
            twa: Math.abs(uinfo.twa),
            twaStyle: 'style="color: ' + ((uinfo.twa < 0) ? "red" : "green") + ';"',
            sail: sailNames[uinfo.sail] || "-",
            xfactorStyle: 'style="color:' + ((uinfo.xplained) ? "black" : "red") + ';"',
            nameStyle: "",
            bcolor: '#2266AA'
        };

        if (uid == currentUserId) {
            res.nameStyle = "color: #F70000; font-weight: bold; ";
            res.bcolor = '#F70000';
            if (!uinfo.displayName) {
                res.name = 'Me';
            }
        } else {
            var idx = category.indexOf(uinfo.type);
            var style = categoryStyle[idx];
            res.nameStyle = style.nameStyle;
            res.bcolor = style.bcolor;
            if ((uinfo.isFollowed || uinfo.followed)) {
                res.nameStyle += " font-weight: bold;";
                res.bcolor = '#108040';
            } else if ((uinfo.teamname == currentTeam || uinfo.team)) {
                res.nameStyle = "color: #C52020; font-weight: bold;";
                res.bcolor = '#C52020';
            }
        }

        if (uinfo.type == "sponsor") {
            if (uinfo.branding && uinfo.branding.name) {
                res.name += "(" + uinfo.branding.name + ")";
            }
        }

        return (res);
    }

    function isDisplayEnabled (record, uid) {
        return  (uid == currentUserId)
            || ((record.isFollowed || record.followed) && cbFriends.checked)
            || ((record.teamname == currentTeam || record.team) && cbTeam.checked)
            || (record.type == "normal" && cbOpponents.checked)
            || (record.type == "top" && cbTop.checked)
            || (record.type == "certified" && cbCertified.checked)
            || (record.type == "real" && cbReals.checked)
            || (record.type == "sponsor" && cbSponsors.checked);
    }

    function makeFriendListLine (uid) {
        if (uid == undefined) {
            return "";
        } else {
            var r = this.uinfo[uid];
            var race = races.get(selRace.value);
            if (r == undefined || race.legdata == undefined) return "";

            var bi = boatinfo(uid, r);

            r.dtf = r.distanceToEnd;
            r.dtfC = Util.gcDistance(r.pos, race.legdata.end);
            if (!r.dtf || r.dtf == "null") {
                r.dtf = r.dtfC;
            }

            var isDisplay = isDisplayEnabled(r, uid) &&  ( !cbInRace.checked || r.state == "racing" );

            if (isDisplay) {
                return '<tr class="hov" id="ui:' + uid + '">'
                    + (race.url ? ('<td class="tdc"><span id="rt:' + uid + '">&#x2388;</span></td>') : '<td>&nbsp;</td>')
                    + '<td style="' + bi.nameStyle + '">' + bi.name + '</td>'
                    + recordRaceFields(race, r)
                    + '<td>' + formatDateShort(r.lastCalcDate) + '</td>'
                    + '<td>' + (r.rank ? r.rank : "-") + '</td>'
                    + "<td>" + ((r.dtf==r.dtfC) ?"(" + Util.roundTo(r.dtfC, 1) + ")":r.dtf) + "</td>"
                    + '<td>' + (r.distanceToUs ? r.distanceToUs : "-") + '</td>'
                    + '<td>' + (r.bearingFromUs ? r.bearingFromUs + "&#x00B0;" : "-") + '</td>'
                    + '<td>' + bi.sail + '</td>'
                    + '<td>' + (r.state || "-") + '</td>'
                    + '<td>' + (r.pos ? Util.formatPosition(r.pos.lat, r.pos.lon) : "-") + '</td>'
                    + '<td>' + Util.roundTo(bi.heading, 3) + '</td>'
                    + '<td ' + bi.twaStyle + '>' + Util.roundTo(bi.twa, 3) + '</td>'
                    + '<td>' + Util.roundTo(bi.tws, 1) + '</td>'
                    + '<td>' + Util.roundTo(bi.speed, 2) + '</td>'
                    + '<td ' + bi.xfactorStyle + '>' + Util.roundTo(r.xfactor, 4) + '</td>'
                    + '<td>' + (r.xoption_foils || "?") + '</td>'
                    + '<td>' + (r.xoption_options || "?") + '</td>'
                    + '</tr>';
            }
        }
    }

    function recordRaceFields (race, r) {
        if (race.type === "record") {
            if (r.state === "racing" && r.distanceToEnd) {
                try {
                    var raceTime = (r.tsRecord - r.startDate);
                    var estimatedSpeed = r.distanceFromStart / (raceTime / 3600000);
                    var eTtF = (r.distanceToEnd / estimatedSpeed) * 3600000;
                    var eRT = raceTime + eTtF;
                    r.avgSpeed = estimatedSpeed;
                    r.eRT = eRT;
                } catch (e) {
                    r.eRT = e.toString();
                }
                return '<td>' + formatDate(r.startDate, 'UserCard missing') + '</td>'
                    + '<td>' + Util.formatDHMS(r.eRT) + '</td>'
                    + '<td>' + Util.roundTo(r.avgSpeed, 2) + '</td>';
            } else {
                return '<td>' + 'UserCard missing' + '</td>'
                    + '<td> - </td>'
                    + '<td> - </td>';
            }
        } else {
            return "";
        }
    }

    function makeRaceStatusHTML () {
        return '<table>'
            + '<thead>'
            + raceStatusHeader
            + '</thead>'
            + '<tbody>'
            + Array.from(races || []).map(makeRaceStatusLine).join(" ");
            + '</tbody>'
            + '</table>';
    }

    function updateFleetHTML (rf) {
        if (rf === undefined) {
             "No friend positions received yet";
        } else {
            sortFriends(rf);
            var fleetHTML =
                '<table>'
                + '<thead class="sticky">'
                + friendListHeader()
                + '</thead>'
                + '<tbody>'
                + Array.from(rf.table || []).map(makeFriendListLine, rf).join(" ");
                + '</tbody>'
                + '</table>';
            divFriendList.innerHTML = fleetHTML;
        }
    }

    function makeTableHTML (r) {
        return '<table>'
            + '<thead class="sticky">'
            + tableHeader
            + '</thead>'
            + '<tbody>'
            + (r === undefined ? "" : r.tableLines.join(" "))
            + '</tbody>'
            + '</table>';
    }

    ////////////////////////////////////////////////////////////////////////////////
    // mergeBoatInfo
    //
    // Boat info comes from two sources:
    // - fleet messages
    // - boatinfo messages
    // We store all the information in one place and update fields,
    // assuming same-named fields have the same meaning in both messages.
    var elemList = ["_id",                                     //  boatinfo
                    "userId",                                  //  getfleet 
                    "baseInfos",                               //  UserCard - .team.name
                    "boat",                                    //  boatinfo, fleet
                    "displayName",                             //  boatinfo, fleet
                    "distanceFromStart",                       //  boatinfo
                    "distanceToEnd",                           //  boatinfo
                    "extendedInfos",                           //  UserCard, fleet (real boat)
                    "isFollowed",                              //  UserCard, fleet
                    "followed",                                //  fleet
                    "fullOptions",                             //  boatinfo
                    "gateGroupCounters",                       //  boatinfo
                    "hasPermanentAutoSails",                   //  boatinfo
                    "heading",                                 //  boatinfo, fleet
                    "isRegulated",                             //  boatinfo, UserCard
                    "lastCalcDate",                            //  boatinfo, fleet
                    "legStartDate",                            //  boatinfo
                    "mode",
                    "options",                                 //  boatinfo
                    "personal",                                //  boatinfo
                    "pos",                                     //  boatinfo, fleet
                    "rank",                                    //  boatinfo, fleet
                    "sail",                                    //  boatinfo, fleet (null)
                    "speed",                                   //  boatinfo, fleet
                    "startDate",                               //  boatinfo, fleet (null)
                    "state",                                   //  boatinfo, fleet, UserCard (!= boatinfo state!)
                    // Don't copy team &  teamnane, special handling.
                    // "team",                                    //  fleet
                    // "teamname",                                //  UserCard.baseInfos, AccountDetails
                    "track",                                   //  [track], fleet
                    "tsRecord",
                    "tsEndOfAutoSail",                         //  ?
                    "tsLastEngine",                            //  boatinfo
                    "twa",                                     //  boatinfo, fleet (null)
                    "tws",                                     //  boatinfo, fleet (null)
                    "type"                                     //  boatinfo, fleet (normal, real, certified, top, sponsor)
                   ];

    function mergeBoatInfo (rid, mode, uid, data) {
        var fleet = raceFleetMap.get(rid);

        if (!fleet) {
            console.log("raceInfo not initialized");
            return;
        }

        var race = races.get(rid);
        var storedInfo = fleet.uinfo[uid];
        var boatPolars = (data.boat) ? polars[data.boat.polar_id] : undefined;

        if (!storedInfo) {
            storedInfo = new Object();
            fleet.uinfo[uid] = storedInfo;
            fleet.table.push(uid);
        }

        if (data.team && data.team.name) {
            storedInfo.teamname = data.team.name;
        } else if (data.team) {
            storedInfo.team = data.team;
            storedInfo.teamname = currentTeam;
        }

        // copy elems from data to uinfo
        elemList.forEach( function (tag) {
            if (tag in data &&  data[tag]) {
                storedInfo[tag] = data[tag];
                if (tag == "baseInfos") {
                    storedInfo.displayName = data["baseInfos"].displayName;
                } else if (tag == "pos") { // calc gc distance to us
                    storedInfo.distanceToUs = Util.roundTo(Util.gcDistance(race.curr.pos, data.pos), 1);
                    storedInfo.bearingFromUs = Util.roundTo(Util.courseAngle(race.curr.pos.lat, race.curr.pos.lon, data.pos.lat, data.pos.lon) * 180 / Math.PI, 1);
                    var ad = storedInfo.bearingFromUs - race.curr.heading + 90;
                    if (ad < 0) ad += 360;
                    if (ad > 360) ad -= 360;
                    if (ad > 180) storedInfo.distanceToUs = -storedInfo.distanceToUs; // "behind" us
                }
            }
        });

        fixMessageData(storedInfo, uid);

        if (boatPolars) {
            //              var sailDef = getSailDef(boatPolars.sail, data.sail % 10);
            var sailDef = boatPolars.sail[data.sail % 10 - 1];

            // "Real" boats have no sail info
            // "Waiting" boats have no TWA
            if (data.state == "racing" && sailDef && data.twa && data.tws) {
                var iA = fractionStep(data.twa, boatPolars.twa);
                var iS = fractionStep(data.tws, boatPolars.tws);

                // "Plain" speed
                var speedT = pSpeed(iA, iS, sailDef.speed);
                // Speedup factors
                var foilFactor = foilingFactor(["foil"], data.tws, data.twa, boatPolars.foil);
                var hullFactor = boatPolars.hull.speedRatio;

                // Explain storedInfo.speed from plain speed and speedup factors
                explain(storedInfo, foilFactor, hullFactor, speedT);
            }
        } else {
            storedInfo.xplained = true;
            storedInfo.xfactor = 1.0;
            storedInfo.xoption_foils = "---";
            storedInfo.xoption_options = "---";
        }
        if (data["rank"] > 0) storedInfo["rank"] = data["rank"];
    }

    function fixMessageData (message, userId) {

        if (message.type == "pilotBoat") {
            message.displayName = "Frigate";
        } else if (message.type == "real") {
            message.displayName = message.extendedInfos.boatName;
            message.rank = message.extendedInfos.rank;
        }

        message.tsRecord = message.lastCalcDate || Date.now();
    }

    function initFoils (boatData) {
        if (boatData.options) {
            for (const feature of boatData.options) {
                if (feature == "foil") {
                    return "0%";
                }
            }
            return "no";
        } else {
            return "?";
        }
    }

    function explain (info, foilFactor, hullFactor, speedT) {
        info.xfactor = info.speed / speedT;
        info.xoption_foils = initFoils(info);
        info.xoption_options = "?";
        info.xplained = false;

        var foils = ((foilFactor - 1) * 100) / 4 * 100;

        if (epsEqual(info.xfactor, 1.0)) {
            // Speed agrees with "plain" speed.
            // Explanation: 1. no hull and 2. foiling condition => no foils.
            info.xplained = true;
            // info.xoption_options = "no";
            if (foilFactor > 1.0) {
                info.xoption_foils = "no";
            }
        } else {
            // Speed does not agree with plain speed.
            // Check if hull, foil or hull+foil can explain the observed speed.
            if (epsEqual(info.speed, speedT * hullFactor)) {
                info.xplained = true;
                if (epsEqual(hullFactor, foilFactor)) {
                    // Both hull and foil match.
                    // info.xoption_options = "(hull), ?";
                    info.xoption_foils = "(" + Util.roundTo(foils, 0) + "%)";
                } else {
                    // info.xoption_options = "hull, ?";
                    if (foilFactor > 1.0) {
                        info.xoption_foils = "no";
                    }
                }
            } else if (epsEqual(info.speed, speedT * foilFactor)) {
                info.xplained = true;
                // info.xoption_options = "hull=no, ?";
                info.xoption_foils = Util.roundTo(foils, 0) + "%";
            } else if (epsEqual(info.speed, speedT * foilFactor * hullFactor)) {
                info.xplained = true;
                // info.xoption_options = "hull, ?";
                info.xoption_foils = Util.roundTo(foils, 0) + "%";
            }
        }

        if (info.fullOptions === true) {
            info.xoption_options = "Full Pack";
        } else if (info.options) {
            if (info.options.length == 8) {
                info.xoption_options = "All Options";
            } else {
                info.xoption_options = info.options.sort().toString();
            }
        }
    }

    function epsEqual (a, b) {
        return Math.abs(b - a) < 0.00001;
    }

    function sortFriends (fleet) {
        if (sortField != "none") {
            sortFriendsByField(fleet, sortField);
        } else {
            sortFriendsByCategory(fleet);
        }
    }

    function sortFriendsByField (rf, field) {
        rf.table.sort(function (uidA, uidB) {
            // Check if we have values at all
            if (rf.uinfo[uidA] == undefined && rf.uinfo[uidB] == undefined) return 0;
            if (rf.uinfo[uidB] == undefined) return -1;
            if (rf.uinfo[uidA] == undefined) return 1;

            // Fetch value of sort field and convert to number.
            var entryA = rf.uinfo[uidA][field];
            var entryB = rf.uinfo[uidB][field];

            // Prefer defined values over undefined values
            if (entryA == undefined && entryB == undefined) return 0;
            if (entryB == undefined) return -1;
            if (entryA == undefined) return 1;

            // Cast to number if possible
            entryA = numeric(entryA);
            entryB = numeric(entryB);

            // Compare values.
            if (currentSortOrder == 0) {
                if (entryA < entryB) return -1;
                if (entryA > entryB) return 1;
            } else {
                if (entryA > entryB) return -1;
                if (entryA < entryB) return 1;
            }
            return 0;
        });
    }

    function numeric (s) {
        var r = String(s);
        if ( r.substr(0, 1) == "(" ) {
            r = r.slice(1, -1);
        }
        if ( isNaN(r) ) {
            r = r.toUpperCase();
        } else {
            r = Number(r);
        }
        return r;
    }

    // generate sorted list, expire old entries
    function sortFriendsByCategory (fleet) {
        var fln = new Array();

        function sortPrio (uinfo) {
            return category.indexOf(uinfo.type);
        }

        Object.keys(fleet.uinfo).forEach( function (key) {
            fln.push(key);
        });

        fln.sort(function (a, b) {
            var au = fleet.uinfo[a];
            var bu = fleet.uinfo[b];
            // followed before opponents
            if (au.followed == bu.followed) {
                if (sortPrio(au) == sortPrio(bu)) {
                    if (au.rank == bu.rank) {
                        return (au.displayName && au.displayName.localeCompare(bu.displayName)) || 0;
                    } else if (au.rank < bu.rank) {
                        return -1;
                    } else {
                        return 1;
                    }
                } else if ( sortPrio(au) < sortPrio(bu) ) {
                    return -1;
                } else {
                    return 1;
                }
            } else if (au.followed) {
                return -1;
            } else {
                return 1;
            }
        });
        fleet.table = fln;
    }

    function updateFleet (rid, mode, data) {
        var fleet = raceFleetMap.get(rid);
        data.forEach(function (message) {
            mergeBoatInfo(rid, mode, message.userId, message);
        });
        sortFriends(fleet);
    }

    function formatSeconds (value) {
        if (value < 0) {
            return "-";
        } else {
            return Util.roundTo(value / 1000, 0);
        }
    }

    function formatDate (ts,
                         dflt,
                         tsOptions = {
                             year: "numeric",
                             month: "numeric",
                             day: "numeric",
                             hour: "numeric",
                             minute: "numeric",
                             second: "numeric",
                             hour12: false,
                             timeZoneName: "short"
                         })
    {
        if (!ts && dflt) return dflt;
        // Do not invent a timestamp here.
        if (!ts) {
            return "undefined";
        }
        // Use UTC if local time is not requested
        if (!cbLocalTime.checked) {
            tsOptions.timeZone = "UTC";
        }
        var d = new Date(ts);
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }

    function formatDateShort (ts, dflt) {
        var tsOptions = {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false,
            timeZoneName: "short"
        }
        return formatDate(ts, dflt, tsOptions);
    }

    function formatTime (ts) {
        var tsOptions = {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hour12: false
        };
        var d = (ts) ? (new Date(ts)) : (new Date());
        if (cbLocalTime.checked) {} else {
            tsOptions.timeZone = "UTC";
        }
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }

    function addTableCommandLine (r) {
        r.tableLines.unshift('<tr>'
                             + '<td>' + formatDate(r.lastCommand.request.ts) + '</td>'
                             + '<td colspan="3">Command @' + formatTime() + '</td>'
                             + '<td colspan="15">Actions:' + printLastCommand(r.lastCommand.request.actions) + '</td>'
                             + '</tr>');
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function makeTableLine (r) {

        function isDifferingSpeed (speed) {
            return Math.abs(1 - r.curr.speed / speed) > 0.01;
        }

        function isCurrent (timestamp) {
            return (timestamp && (timestamp > r.prev.lastCalcDate));
        }

        function getBG (timestamp) {
            return isCurrent(timestamp) ? ('style="background-color: ' + LightRed + ';"') : "";
        }

        function isPenalty () {
            return isCurrent(r.curr.tsEndOfSailChange)
                || isCurrent(r.curr.tsEndOfGybe)
                || isCurrent(r.curr.tsEndOfTack);
        }

        var speedCStyle = "";
        var speedTStyle = "";
        var deltaDist = Util.roundTo(r.curr.deltaD, 3);
        var speedT = "-";
        if (r.curr.speedT) {
            speedT = Util.roundTo(r.curr.speedT.speed, 2) + "&nbsp;(" + r.curr.speedT.sail + ")";
        }

        if (isPenalty()) {
            speedCStyle = 'style="background-color: ' + LightRed + ';"';
        } else if (isDifferingSpeed(r.curr.speedC)) {
            speedCStyle = 'style="background-color: yellow;"';
        } else if (r.curr.speedT && isDifferingSpeed(r.curr.speedT.speed)) {
            // Speed differs but not due to penalty
            speedTStyle = 'style="background-color: ' + LightRed + ';"';
        }
        deltaDist = deltaDist + " (" + Util.roundTo(r.curr.deltaD_T, 3) + ")";

        var sailChange = formatSeconds(r.curr.tsEndOfSailChange - r.curr.lastCalcDate);
        var gybing = formatSeconds(r.curr.tsEndOfGybe - r.curr.lastCalcDate);
        var tacking = formatSeconds(r.curr.tsEndOfTack - r.curr.lastCalcDate);

        return '<tr>'
            + commonTableLines(r)
            + '<td>' + Util.roundTo(r.curr.speed, 2) + '</td>'
            + '<td ' + speedCStyle + '>' + Util.roundTo(r.curr.speedC, 2) + " (" + sailNames[(r.curr.sail % 10)] + ")" + '</td>'
            + '<td ' + speedTStyle + '>' + speedT + '</td>'
            + '<td>' + (r.curr.speedT ? (Util.roundTo(r.curr.speedT.foiling, 0) + "%") : "-") + '</td>'
            + '<td ' + speedTStyle + '>' + deltaDist + '</td>'
            + '<td>' + Util.roundTo(r.curr.deltaT, 0) + '</td>'
            + '<td ' + getBG(r.curr.tsEndOfSailChange) + '>' + sailChange + '</td>'
            + '<td ' + getBG(r.curr.tsEndOfGybe) + '>' + gybing + '</td>'
            + '<td ' + getBG(r.curr.tsEndOfTack) + '>' + tacking + '</td>'
            + '</tr>';
    }

    function saveMessage (r) {
        var newRow = makeTableLine(r);
        r.tableLines.unshift(newRow);
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function updateFleetFilter (race) {
        updateFleetHTML(raceFleetMap.get(selRace.value));
    }

    function changeRace (raceId) {
        if (typeof raceId === "object") { // select event
            raceId = this.value;
        }
        var race = races.get(raceId);
        divRaceStatus.innerHTML = makeRaceStatusHTML();
        divRecordLog.innerHTML = makeTableHTML(race);
        updateFleetHTML(raceFleetMap.get(raceId));
        switchMap(race);
    }

    function getRaceLegId (id) {
        // work around for certain messages (Game_GetOpponents)
        if (id.raceId) {
            return id.raceId + "." + id.legNum;
        } else {
            if (id.leg_num) {
                return id.race_id + "." + id.leg_num;
            } else if (id.num) {
                return id.race_id + "." + id.num;
            } else {
                alert("Unknown race id format");
                return undefined;
            }
        }
    }

    function legId (legInfo) {
        return legInfo.raceId + "." + legInfo.legNum;
    }

    function clearLog () {
        divRawLog.innerHTML = "";
    }

    function tableClick (ev) {
        var call_rt = false;
        var call_wi = false;
        var call_pl = false;
        var friend = false;
        var tabsel = false;
        var cbox = false;
        var dosort = true;
        var rmatch;
        var re_rtsp = new RegExp("^rt:(.+)"); // Call-Router
        var re_polr = new RegExp("^pl:(.+)"); // Call-Polars
        var re_wisp = new RegExp("^wi:(.+)"); // Weather-Info
        var re_rsel = new RegExp("^rs:(.+)"); // Race-Selection
        var re_usel = new RegExp("^ui:(.+)"); // User-Selection
        var re_tsel = new RegExp("^ts:(.+)"); // Tab-Selection
        var re_cbox = new RegExp("^sel_(.+)"); // Checkbox-Selection

        var ev_lbl = ev.target.id;

        switch (ev_lbl) {
        case "th_name":
            sortField = "displayName";
            break;
        case "th_rank":
            sortField = "rank";
            break;
        case "th_lu":
            sortField = "lastCalcDate";
            break;
        case "th_sd":
            sortField = "startDate";
            break;
        case "th_ert":
            sortField = "eRT";
            break;
        case "th_avgspeed":
            sortField = "avgSpeed";
            break;
        case "th_dtf":
            sortField = "dtf";
            break;
        case "th_dtu":
            sortField = "distanceToUs";
            break;
        case "th_state":
            sortField = "state";
            break;
        case "th_hdg":
            sortField = "heading";
            break;
        case "th_twa":
            sortField = "twa";
            break;
        case "th_tws":
            sortField = "tws";
            break;
        case "th_speed":
            sortField = "speed";
            break;
        case "th_sail":
            sortField = "sail";
            break;
        case "th_options":
            sortField = "xoption_options";
            break;
        case "th_rt":
        case "th_brg":
        case "th_psn":
        case "th_foils":
            sortField = "none";
            break;
        default:
            dosort = false;
        }

        // Sort friends table
        if (dosort) {
            if (sortField == currentSortField) {
                currentSortOrder = 1 - currentSortOrder;
            } else {
                currentSortField = sortField;
                currentSortOrder = 0;
            }
            updateFleetHTML(raceFleetMap.get(selRace.value));
        }

        for (var node = ev.target; node; node = node.parentNode) {
            var id = node.id;
            var match;
            if (re_rtsp.exec(id)) {
                call_rt = true;
            } else if (re_polr.exec(id)) {
                call_pl = true;
            } else if (re_wisp.exec(id)) {
                call_wi = true;
            } else if (match = re_rsel.exec(id)) {
                rmatch = match[1];
            } else if (match = re_usel.exec(id)) {
                rmatch = match[1];
                friend = true;
            } else if (match = re_tsel.exec(id)) {
                rmatch = match[1];
                tabsel = true;
            } else if (match = re_cbox.exec(id)) {
                rmatch = match[1];
                cbox = true;
            }
        }
        if (rmatch) {
            if (tabsel) {
                // Tab-Selection
                for (var t = 1; t <= 4; t++) {
                    document.getElementById("tab-content" + t).style.display = (rmatch == t ? "block" : "none");
                }
                if (rmatch == 4) {
                    var race = races.get(selRace.value);
                    initializeMap(race);
                }
                if (rmatch == 2 || rmatch == 4) {
                    display_selbox("visible");
                } else {
                    display_selbox("hidden");
                }
            } else if (friend) {
                // Friend-Routing
                if (call_rt) callRouter(selRace.value, rmatch, false);
            } else if (cbox) {
                // Skippers-Choice
                changeState(ev_lbl);
                updateFleetHTML(raceFleetMap.get(selRace.value));
                updateMapFleet(races.get(selRace.value));
            } else {
                // Race-Switching
                if (call_wi) callWindy(rmatch, 0); // weather
                if (call_rt) callRouter(rmatch, currentUserId, false);
                if (call_pl) callPolars(rmatch);
                enableRace(rmatch, true);
                changeRace(rmatch);
            }
        }
    }

    function changeState (lbl_tochange) {
        var cbxlbl = lbl_tochange.replace("lbl_", "sel_");
        var selectedcbx = document.getElementById(cbxlbl);
        if (selectedcbx.checked) {
            selectedcbx.checked = false;
        } else {
            selectedcbx.checked = true;
        }
    }

    function display_selbox (state) {
        selFriends.style.visibility = state;
    }

    function resize (ev) {
        for (var t = 1; t <= 4; t++) {
            var tab = document.getElementById("tab-content" + t);
            tab.style.height = window.innerHeight - tab.getBoundingClientRect().y;
        }
    }

    function enableRace (id, force) {
        for (var i = 0; i < selRace.options.length; i++) {
            if (selRace.options[i].value == id) {
                selRace.options[i].disabled = false;
                if (selRace.selectedIndex == -1 || force) {
                    selRace.selectedIndex = i;
                }
            }
        }
    }

    function renameRace (id, newname) {
        for (var i = 0; i < selRace.options.length; i++) {
            if (selRace.options[i].value == id) {
                selRace.options[i].text = newname;
            }
        }
    }

    function disableRaces () {
        for (var i = 0; i < selRace.options.length; i++) {
            selRace.options[i].disabled = true;
        }
        selRace.selectedIndex == -1;
    }

    function addRace (message) {
        var raceId = getRaceLegId(message._id);
        var race = {
            id: raceId,
            name: "Race #" + raceId,
            source: "tmp"
        };
        initRace(race, false);
        return race;
    }

    function updatePosition (message, r) {
        if (r === undefined) { // race not listed
            r = addRace(message);
        }

        if (r.curr !== undefined && r.curr.lastCalcDate == message.lastCalcDate) {
            // Repeated message
            // return;
        }

        if (!r.curr) {
            enableRace(r.id);
        }

        r.prev = r.curr;
        r.curr = message;
        var boatPolars = polars[message.boat.polar_id];
        if (boatPolars == undefined || message.options == undefined || message.tws == undefined) {
        } else {
            r.curr.speedT = theoreticalSpeed(message.tws, message.twa, message.options, boatPolars);
        }
        if (r.prev != undefined) {
            var d = Util.gcDistance(r.prev.pos, r.curr.pos);
            var delta = Util.courseAngle(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon);
            var alpha = Math.PI - Util.angle(Util.toRad(r.prev.heading), delta);
            var beta = Math.PI - Util.angle(Util.toRad(r.curr.heading), delta);
            var gamma = Util.angle(Util.toRad(r.curr.heading), Util.toRad(r.prev.heading));
            // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
            r.curr.deltaT = (r.curr.lastCalcDate - r.prev.lastCalcDate) / 1000;
            if (r.curr.deltaT > 0
                && Math.abs(Util.toDeg(gamma) - 180) > 1
                && Util.toDeg(alpha) > 1
                && Util.toDeg(beta) > 1) {
                r.curr.deltaD = d / Math.sin(gamma) * (Math.sin(beta) + Math.sin(alpha));
            } else {
                r.curr.deltaD = d;
            }
            r.curr.speedC = Math.abs(Util.roundTo(r.curr.deltaD / r.curr.deltaT * 3600, 2));
            // deltaD_T = Delta distance computed from speedT
            if (r.curr.speedT) {
                r.curr.deltaD_T = r.curr.deltaD / r.curr.speedC * r.curr.speedT.speed;
            }
            saveMessage(r);
        }
        if (message.gateGroupCounters) {
            r.gatecnt = message.gateGroupCounters;
            updateMapCheckpoints(r);
        }
        divRaceStatus.innerHTML = makeRaceStatusHTML();
    }

    function theoreticalSpeed (tws, twa, options, boatPolars) {
        var foil = foilingFactor(options, tws, twa, boatPolars.foil);
        var foiling = (foil - 1.0) * 100 / (boatPolars.foil.speedRatio - 1.0);
        var hull = options.includes("hull") ? 1.003 : 1.0;
        var ratio = boatPolars.globalSpeedRatio;
        var twsLookup = fractionStep(tws, boatPolars.tws);
        var twaLookup = fractionStep(twa, boatPolars.twa);
        var speed = maxSpeed(options, twsLookup, twaLookup, boatPolars.sail);
        return {
            "speed": Util.roundTo(speed.speed * foil * hull * ratio, 2),
            "sail": sailNames[speed.sail],
            "foiling": foiling
        };
    }

    function maxSpeed (options, iS, iA, sailDefs) {
        var maxSpeed = 0;
        var maxSail = "";
        for (const sailDef of sailDefs) {
            if (sailDef.id === 1
                || sailDef.id === 2
                || (sailDef.id === 3 && options.includes("heavy"))
                || (sailDef.id === 4 && options.includes("light"))
                || (sailDef.id === 5 && options.includes("reach"))
                || (sailDef.id === 6 && options.includes("heavy"))
                || (sailDef.id === 7 && options.includes("light"))) {
                var speed = pSpeed(iA, iS, sailDef.speed);
                if (speed > maxSpeed) {
                    maxSpeed = speed;
                    maxSail = sailDef.id;
                }
            }
        }
        return {
            speed: maxSpeed,
            sail: maxSail
        }
    }

    function getSailDef (sailDefs, id) {
        for (const sailDef of sailDefs) {
            if (sailDef.id === id) {
                return sailDef;
            }
        }
        return null;
    }

    function pSpeed (iA, iS, speeds) {
        return bilinear(iA.fraction, iS.fraction,
                        speeds[iA.index - 1][iS.index - 1],
                        speeds[iA.index][iS.index - 1],
                        speeds[iA.index - 1][iS.index],
                        speeds[iA.index][iS.index]);
    }

    function bilinear (x, y, f00, f10, f01, f11) {
        return f00 * (1 - x) * (1 - y)
            + f10 * x * (1 - y)
            + f01 * (1 - x) * y
            + f11 * x * y;
    }

    function foilingFactor (options, tws, twa, foil) {
        var speedSteps = [0, foil.twsMin - foil.twsMerge, foil.twsMin, foil.twsMax, foil.twsMax + foil.twsMerge, Infinity];
        var twaSteps = [0, foil.twaMin - foil.twaMerge, foil.twaMin, foil.twaMax, foil.twaMax + foil.twaMerge, Infinity];
        var foilMat = [[1, 1, 1, 1, 1, 1],
                       [1, 1, 1, 1, 1, 1],
                       [1, 1, foil.speedRatio, foil.speedRatio, 1, 1],
                       [1, 1, foil.speedRatio, foil.speedRatio, 1, 1],
                       [1, 1, 1, 1, 1, 1],
                       [1, 1, 1, 1, 1, 1]];

        if (options.includes("foil")) {
            var iS = fractionStep(tws, speedSteps);
            var iA = fractionStep(twa, twaSteps);
            return bilinear(iA.fraction, iS.fraction,
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
        while (index < steps.length && steps[index] <= absVal) {
            index++;
        }
        if (index < steps.length) {
            return {
                index: index,
                fraction: (absVal - steps[index - 1]) / (steps[index] - steps[index - 1])
            }
        } else {
            return {
                index: index - 1,
                fraction: 1.0
            }
        }
    }



    function callWindy (raceId, userId) {
        var baseURL = "https://www.windy.com";
        var r = races.get(raceId);
        var uinfo;

        if (userId) {
            uinfo = raceFleetMap.get(raceId).uinfo[userId];
            if (uinfo === undefined) {
                alert("Can't find record for user id " + userId);
                return;
            }
        }
        var pos = r.curr.pos;
        if (uinfo) pos = uinfo.pos;
        var url = baseURL + "/?gfs," + pos.lat + "," + pos.lon + ",6,i:pressure,d:picker";
        var tinfo = "windy:" + r.url;
        window.open(url, cbReuseTab.checked ? tinfo : "_blank");
    }

    function callPolars (raceId) {
        var baseURL = "http://toxcct.free.fr/polars/?race_id=" + raceId;
        var race = races.get(raceId);

        var twa = Math.abs(Util.roundTo(race.curr.twa || 20, 0));
        var tws = Util.roundTo(race.curr.tws || 4, 1);

        if (!race.curr.tws || !race.curr.twa) {
            alert("Missing TWA and/or TWS, calling polars with TWA=" + twa + "°, TWS=" + tws + "kn");
        }

        var url = baseURL + "&tws=" + tws + "&twa=" + twa;

        for (const option of race.curr.options) {
            url += "&" + race.curr.options[option] + "=true";
        }

        url += "&utm_source=VRDashboard";

        window.open(url, cbReuseTab.checked ? baseURL : "_blank");
    }

    function switchMap (race) {
        initializeMap(race);
        races.forEach(function (r) {
            if (r.gdiv) {
                if (r == race) {
                    r.gdiv.style.display = "block";
                    // r.gmap.fitBounds(r.gbounds);

                } else {
                    r.gdiv.style.display = "none";
                }
            }
        });
    }

    function initializeMap (race) {
        if (!race || !race.legdata) return; // no legdata yet;

        if (!race.gdiv) {
            // Create div
            var divMap = document.createElement('div');
            divMap.style.height = "100%";
            divMap.style.display = "block";
            document.getElementById("tab-content4").appendChild(divMap);
            race.gdiv = divMap;

            // Create map
            var mapOptions = {
                mapTypeId: "terrain",
                scaleControl: true
            };
            var map = new google.maps.Map(divMap, mapOptions);

            map.addListener("rightclick", onMapRightClick);
            
            map.setTilt(90);
            race.gmap = map;

            // Customize & init map
            var bounds = race.gbounds = new google.maps.LatLngBounds();

            // start, finish
            var pos = new google.maps.LatLng(race.legdata.start.lat, race.legdata.start.lon);
            addmarker(map, bounds, pos, undefined, {
                color: "blue",
                text: "S"
            }, "Start: " + race.legdata.start.name + "\nPosition: " + Util.formatPosition(race.legdata.start.lat, race.legdata.start.lon), "S", 10, 1);
            pos = new google.maps.LatLng(race.legdata.end.lat, race.legdata.end.lon);
            addmarker(map, bounds, pos, undefined, {
                color: "yellow",
                text: "F"
            }, "Finish: " + race.legdata.end.name + "\nPosition: " + Util.formatPosition(race.legdata.end.lat, race.legdata.end.lon), "F", 10, 1);
            var fincircle = new google.maps.Circle({
                strokeColor: "#FF0000",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillOpacity: 0,
                map: map,
                center: pos,
                radius: race.legdata.end.radius * 1852.0,
                zIndex: 9
            });

            // course
            var cpath = [];
            for (var i = 0; i < race.legdata.course.length; i++) {
                cpath.push(new google.maps.LatLng(race.legdata.course[i].lat, race.legdata.course[i].lon));
            }
            var arrow = {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW
            };
            var ccpath = new google.maps.Polyline({
                path: cpath,
                icons: [{
                    icon: arrow,
                    repeat: "50px"
                }],
                geodesic: true,
                strokeColor: "#FFFFFF",
                strokeOpacity: 0.5,
                strokeWeight: 1,
                zIndex: 4
            });
            ccpath.setMap(map);

            //  Ice limits
            if (race.legdata.ice_limits) {
                var iceLimit = [];
                var iceData = race.legdata.ice_limits.south;
                for (var i = 0; i < iceData.length; i++) {
                    iceLimit.push(new google.maps.LatLng(iceData[i].lat, iceData[i].lon));
                }
                var icePath = new google.maps.Polyline({
                    path: iceLimit,
                    geodesic: false,
                    strokeColor: "#FF0000",
                    strokeOpacity: 0.5,
                    strokeWeight: 4,
                    zIndex: 4
                });
                icePath.setMap(map);
            }

            map.fitBounds(bounds);
        }

        updateMapWaypoints(race);
    }

    function clearTrack (map, db) {
        if (map[db])
            for (var i = 0; i < map[db].length; i++) {
                map[db][i].setMap(null);
            }
        map[db] = new Array();
    }


    var colors = [];
    colors.push("#000000");
    colors.push("#0080ff");
    colors.push("#ff0000");
    colors.push("#00cc00");
    colors.push("#d020ff");
    colors.push("#ffff00");
    colors.push("#00ffff");
    colors.push("#ffc000");
    colors.push("#8020ff");
    colors.push("#ff8000");
    colors.push("#a0ff00");
    colors.push("#0000ff");
    colors.push("#f00080");
    colors.push("#00ffa0");
    colors.push("#ffffff");

    function getColor (i) {
        if (i >= colors.length) {
            colors.push(randomColor());
            getColor(i);
        } else {
            return colors[i];
        }
    }

    function updateMapCheckpoints (race) {

        if (!race) return;

        var map = race.gmap;
        var bounds = race.gbounds;

        // checkpoints
        if (!race.legdata) return;
        if (!map) return;
        clearTrack(map,"_db_cp");

        var groupColors = [];
        for (var i = 0; i < race.legdata.checkpoints.length; i++) {

            var cp = race.legdata.checkpoints[i];
            var cp_name = "invsible";
            if (cp.display != "none") cp_name = cp.display;

            if (!groupColors[cp.group]) {
                groupColors[cp.group] = getColor(cp.group);
            }

            var position_s = new google.maps.LatLng(cp.start.lat, cp.start.lon);
            var position_e = new google.maps.LatLng(cp.end.lat, cp.end.lon);

            var c_sb = "#00FF00";
            var c_bb = "#FF0000";
            var zi = 8;
            if (cp.display == "none") {
                c_sb = "#448800";
                c_bb = "#884400";
                zi = 6;
            }

            var op = 1.0;
            var g_passed = false;
            if (race.gatecnt[cp.group - 1]) {
                g_passed = true;
                op = 0.5;
            } // mark/gate passed - semi transparent

            var label_g = "checkpoint " + cp.group + "." + cp.id +  ", type: " + cp_name + ", engine: " + cp.engine + ", name: " + cp.name + (g_passed ? ", PASSED" : "");
            var side_s =  cp.side ;
            var side_e = (cp.side == "stbd")?"port":"stbd";
            var label_s = label_g + ", side: " + side_s + "\nPosition: " + Util.formatPosition(cp.start.lat, cp.start.lon);
            var label_e = label_g + ", side: " + side_e + "\nPosition: " + Util.formatPosition(cp.end.lat, cp.end.lon);

            if (cp.side == "stbd") {
                map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_sb, "C"), undefined, label_s, i, zi, op));
                map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol(c_bb, "C"), undefined, label_e, i, zi, op));
            } else {
                map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_bb, "C"), undefined, label_s, i, zi, op));
                map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol(c_sb, "C"), undefined, label_e, i, zi, op));
            }

            if (cp.display == "gate") {
                if (cp.side == "stbd") {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol("#FFFF00", "RR"), undefined, label_s, i, 8, op));
                    map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol("#FFFF00", "RL"), undefined, label_e, i, 8, op));
                } else {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol("#FFFF00", "RL"), undefined, label_s, i, 8, op));
                    map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol("#FFFF00", "RR"), undefined, label_e, i, 8, op));
                }
            } else if (cp.display == "buoy") {
                if (cp.side == "stbd") {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_sb, "RR"), undefined, label_s, i, 8, op));
                } else {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_bb, "RL"), undefined, label_s, i, 8, op));
                }
            } else {
                if (cp.side == "stbd") {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_sb, "RR"), undefined, label_s, i, zi, op));
                } else {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_bb, "RL"), undefined, label_s, i, zi, op));
                }
            }
            var path = [];
            path.push(position_s);
            path.push(position_e);
            var ppath = new google.maps.Polyline({
                path: path,
                strokeOpacity: 0.0,
                icons: [{
                    icon: pinSymbol(groupColors[cp.group], "DL", op),
                    repeat: "16px"
                }],
                geodesic: true,
                zIndex: cp.display == "none" ? 5 : 6
            });
            ppath.setMap(map);
            map._db_cp.push(ppath);
        }
    }

    function updateMapWaypoints (race) {

        var googleMap = race.gmap;
        var bounds = race.gbounds;

        if (!race.curr) return; // current position unknown
        if (!googleMap) return; // no map yet
        clearTrack(googleMap,"_db_wp");

        // track wp
        var tpath = [];
        if (race.waypoints) {
            var action = race.waypoints
            if (action.pos) {

                // Waypoint lines
                tpath.push(new google.maps.LatLng(race.curr.pos.lat, race.curr.pos.lon)); // boat
                for (var i = 0; i < action.pos.length; i++) {
                    tpath.push(new google.maps.LatLng(action.pos[i].lat, action.pos[i].lon));
                }
                var ttpath = makeTTPath(tpath,"#8000FF");
                ttpath.setMap(googleMap);
                googleMap._db_wp.push(ttpath);

                // Waypoint markers
                for (var i = 0; i < action.pos.length; i++) {
                    var waypoint = new google.maps.Marker({
                        title: Util.formatPosition(action.pos[i].lat, action.pos[i].lon),
                        position: {"lat": action.pos[i].lat,
                                   "lng": action.pos[i].lon
                                  },
                        map: googleMap,
                        draggable: false
                    });
                    googleMap._db_wp.push(waypoint);
                }
            } else {
                console.error("Unexpected waypoint format: " + JSON.stringify(action));
            }
        }
    }

    function updateMapMe (race, track) {
        var map = race.gmap;

        if (!map) return; // no map yet

        // track
        var tpath = [];
        if (track) {
            clearTrack(map, "_db_me");
            for (var i = 0; i < track.length; i++) {
                var segment = track[i];
                var pos = new google.maps.LatLng(segment.lat, segment.lon);
                tpath.push(pos);
                if (cbMarkers.checked) {
                    if (i > 0) {
                        var deltaT = (segment.ts -  track[i-1].ts) / 1000;
                        var deltaD =  Util.gcDistance(track[i-1], segment);
                        var speed = Util.roundTo(Math.abs(deltaD / deltaT * 3600), 2);
                        var timeStamp = new Date(segment.ts);
                        var label =  "Me" + "|" + timeStamp.toISOString() + "|" + speed + "kn" + "|" + (segment.tag || "-");
                        var marker = new google.maps.Marker({
                            icon: {
                                url: 'img/dot.png',
                                size: new google.maps.Size(12, 12),
                                origin: new google.maps.Point(6, 6),
                                anchor: new google.maps.Point(6, 6)
                            },
                            position: pos,
                            map: map,
                            title: label
                        });
                        map._db_me.push(marker);
                    }
                }
            }
            var ttpath = makeTTPath(tpath, "#44FF44");
            ttpath.setMap(map);
            map._db_me.push(ttpath);
        }

        var bounds = race.gbounds;
        // boat
        if (race.curr && race.curr.pos) {
            var pos = new google.maps.LatLng(race.curr.pos.lat, race.curr.pos.lon);
            var title =  "HDG: " + Util.roundTo(race.curr.heading, 1) + " | TWA: " + Util.roundTo(race.curr.twa, 1) + " | SPD: " + Util.roundTo(race.curr.speed, 2)
            map._db_me.push(addmarker(map, bounds, pos, pinSymbol("#44FF44", "B", 0.7, race.curr.heading), undefined, title, 'me', 20, 0.7));
        }
    }

    function updateMapLeader (race) {
        var map = race.gmap;

        if (!map) return; // no map yet
        if (!race.curr) return;
        // if (race.curr.state != "racing") return;
        if (!race.curr.startDate) return;

        var d = new Date();
        var offset = d - race.curr.startDate;

        // track
        if (race.leaderTrack && race.leaderTrack.length > 0) {
            addGhostTrack(map, race.gbounds, race.leaderTrack, "Leader", "Leader: " + race.leaderName + " | Elapsed: " + Util.formatDHMS(offset), offset, "_db_leader", "#3d403a");
        }
        if (race.myTrack && race.myTrack.length > 0) {
            addGhostTrack(map, race.gbounds, race.myTrack, "Best Attempt", "Best Attempt" + " | Elapsed: " + Util.formatDHMS(offset), offset, "_db_self", "#4d504a");
        }
    }

    function addGhostTrack (map, bounds, ghostTrack, label, title, offset, db, color) {

        clearTrack(map, db);

        var tpath = [];
        var ghostStartTS = ghostTrack[0].ts;
        var ghostPosTS = ghostStartTS + offset;
        var ghostPos;
        for (var i = 0; i < ghostTrack.length; i++) {
            tpath.push(new google.maps.LatLng(ghostTrack[i].lat, ghostTrack[i].lon));
            if (!ghostPos) {
                if (ghostTrack[i].ts >= ghostPosTS) {
                    ghostPos = i;
                }
            }
        }
        var lineSymbol = {
            path: 'M 0,-1 0,1',
            strokeColor: color,
            strokeOpacity: 1,
            scale: 4
        };
        var ttpath = new google.maps.Polyline({
            path: tpath,
            geodesic: true,
            strokeOpacity: 0.0,
            strokeWeight: 1.5,
            icons: [{
                icon: lineSymbol,
                offset: '0',
                repeat: '20px'
            }],
            zIndex: 4
        });
        ttpath.setMap(map);
        map[db].push(ttpath);

        if (ghostPos) {
            var lat1 = ghostTrack[ghostPos].lat;
            var lon1 = ghostTrack[ghostPos].lon
            var lat0 = ghostTrack[Math.max(ghostPos - 1, 0)].lat;
            var lon0 = ghostTrack[Math.max(ghostPos - 1, 0)].lon;
            var heading = Util.courseAngle(lat0, lon0, lat1, lon1) * 180 / Math.PI;
            var d = (ghostPosTS - ghostTrack[ghostPos - 1].ts ) / (ghostTrack[ghostPos].ts - ghostTrack[ghostPos - 1].ts)
            var lat = lat0 + (lat1-lat0) * d;
            var lon = lon0 + (lon1-lon0) * d;
            var pos = new google.maps.LatLng(lat, lon);
            map[db].push(addmarker(map, bounds, pos, pinSymbol(color, "B", 0.7, heading), label, title, 'leader', 20, 0.7));
        }
    }


    function updateMapFleet (race) {
        var map = race.gmap;
        var bounds = race.gbounds;

        if (!map) return; // no map yet
        clearTrack(map, "_db_op");

        // opponents/followed
        var fleet = raceFleetMap.get(race.id);

        Object.keys(fleet.uinfo).forEach(function (key) {
            var elem = fleet.uinfo[key];
            var bi = boatinfo(key, elem);

            if (isDisplayEnabled(elem, key) && (elem.displayName != lbBoatname.innerHTML)) {
                var pos = new google.maps.LatLng(elem.pos.lat, elem.pos.lon);

                var info = bi.name + " | HDG: " + Util.roundTo(bi.heading, 1) + " | TWA: " + Util.roundTo(bi.twa, 1) + " | SPD: " + Util.roundTo(bi.speed, 2);
                if (elem.startDate && race.type == "record") {
                    info += " | Elapsed: " + Util.formatDHMS(elem.ts - elem.startDate);
                }
                map._db_op.push(addmarker(map, bounds, pos, pinSymbol(bi.bcolor, "B", 0.7, elem.heading), undefined, info, "U:" + key, 18, 0.7));
                // track
                var tpath = [];
                if (elem.track) {
                    for (var i = 0; i < elem.track.length; i++) {
                        var segment = elem.track[i];
                        var pos = new google.maps.LatLng(segment.lat, segment.lon);
                        tpath.push(pos);
                        if (cbMarkers.checked && ((key == currentUserId)
                                                  || elem.isFollowed
                                                  || elem.followed))
                        {
                            if (i > 0) {
                                var deltaT = (segment.ts -  elem.track[i-1].ts) / 1000;
                                var deltaD =  Util.gcDistance(elem.track[i-1], segment);
                                var speed = Util.roundTo(Math.abs(deltaD / deltaT * 3600), 2);
                                var timeStamp = new Date(segment.ts);
                                var label =  elem.displayName + "|" + timeStamp.toISOString() + "|" + speed + "kn" + "|" + (segment.tag || "-");
                                var marker = new google.maps.Marker({
                                    icon: {
                                        url: 'img/dot.png',
                                        size: new google.maps.Size(12, 12),
                                        origin: new google.maps.Point(6, 6),
                                        anchor: new google.maps.Point(6, 6)
                                    },
                                    position: pos,
                                    map: map,
                                    title: label
                                });
                                map._db_op.push(marker);
                            }
                        }
                    }
                    var ttpath = new google.maps.Polyline({
                        path: tpath,
                        geodesic: true,
                        strokeColor: bi.bcolor,
                        strokeOpacity: 0.6,
                        strokeWeight: 1,
                        zIndex: 4
                    });
                    ttpath.setMap(map);
                    map._db_op.push(ttpath);
                }
            }});
    }


    function makeTTPath (tpath, color) {
        return new google.maps.Polyline({
            path: tpath,
            geodesic: true,
            strokeColor: color,
            strokeOpacity: 0.7,
            strokeWeight: 1,
            zIndex: 4
        });
    }

    function addmarker (map, bounds, pos, symbol, label, title, mref, zi, op) {
        var marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: symbol,
            label: label,
            title: title,
            mref: mref,
            zIndex: zi,
            opacity: op
        });
        bounds.extend(pos);
        return marker;
    }

    var ps_pathmap = {
        C: ['M 0 0 C -2 -20 -10 -22 -10 -30 A 10 10 0 1 1 10 -30 C 10 -22 2 -20 0 0 z M -2 -30 a 2 2 0 1 1 4 0 2 2 0 1 1 -4 0', 1, 1],
        RL: ['M 0 -47 A 25 25 0 0 1 23.4923155196477 -13.4494964168583 M 3.9939080863394 -44.6505783192808 L 0 -47 L 4.68850079700712 -48.5898093313296 M 21.650635094611 -9.50000000000001 A 25 25 0 0 1 -19.1511110779744 -5.93030975783651 M 17.6190221917365 -7.2158849772096 L 21.650635094611 -9.50000000000001 L 20.6831999642124 -4.64473453846344 M -21.650635094611 -9.49999999999999 A 25 25 0 0 1 -4.34120444167328 -46.6201938253052 M -21.6129302780759 -14.1335367035096 L -21.650635094611 -9.49999999999999 L -25.3717007612195 -12.7654561302069', 1, 0],
        RR: ['M 0 -47 A 25 25 0 0 1 23.4923155196477 -13.4494964168583 M 22.6505783192808 -18.0060919136606 L 23.4923155196477 -13.4494964168583 L 26.5898093313296 -17.3114992029929 M 21.650635094611 -9.50000000000001 A 25 25 0 0 1 -19.1511110779744 -5.93030975783651 M -14.7841150227904 -4.3809778082635 L -19.1511110779744 -5.93030975783651 L -17.3552654615366 -1.31680003578759 M -21.650635094611 -9.49999999999999 A 25 25 0 0 1 -4.34120444167328 -46.6201938253052 M -7.86646329649038 -43.6129302780759 L -4.34120444167328 -46.6201938253052 L -9.23454386979305 -47.3717007612195', 1, 0],
        B: ['M -8 20 C -12 -5 0 -20 0 -20 C 0 -20 12 -5 8 20 L -8 20', 1, 1],
        DL: ['M 0,-1 0,1', 5, 0]
    };

    function pinSymbol (color, objtyp, opacity, rotation) {
        if (!opacity) opacity = 1.0;
        if (!rotation) rotation = 0.0;
        return {
            path: ps_pathmap[objtyp][0],
            fillColor: color,
            fillOpacity: ps_pathmap[objtyp][2] ? 1.0 : 0.0,
            strokeColor: ps_pathmap[objtyp][2] ? "#000000" : color,
            strokeWeight: 2,
            strokeOpacity: opacity,
            scale: ps_pathmap[objtyp][1],
            rotation: rotation
        };
    }

    function randomColor () {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        return "rgb(" + r + "," + g + "," + b + ")";
    }

    function saveOption (e) {
        localStorage["cb_" + this.id] = this.checked;
    }

    function getOption (name) {
        var value = localStorage["cb_" + name];
        if (value !== undefined) {
            var checkBox = document.getElementById(name);
            checkBox.checked = (value === "true");
            var event = new Event('change');
            checkBox.dispatchEvent(event);
        }
    }

    function readOptions () {
        getOption("auto_router");
        getOption("markers");
        getOption("reuse_tab");
        getOption("local_time");
        getOption("nmea_output");
    }

    function addConfigListeners () {
        cbRouter.addEventListener("change", saveOption);
        cbMarkers.addEventListener("change", saveOption);
        cbMarkers.addEventListener("change", () => {
            updateMapFleet(races.get(selRace.value));
        });
        cbReuseTab.addEventListener("change", saveOption);
        cbLocalTime.addEventListener("change", saveOption);
        cbNMEAOutput.addEventListener("change", saveOption);
    }


    function filterChanged (e) {
        updateMapFleet();
    }


    function onMapRightClick (event) {
        alert(JSON.stringify(event));
        var windowEvent = window.event;
        var mapMenu = document.getElementById("mapMenu");
        var pageY;
        var pageX;
        if (windowEvent != undefined) {
            pageX = windowEvent.pageX;
            pageY = windowEvent.pageY;
        } else {
            pageX = event.pixel.x;
            pageY = event.pixel.y;
        }
        
        mapMenu.style.display = "block";
        mapMenu.style["z-index"] = 400;
        mapMenu.style.top = pageY + "px";
        mapMenu.style.left = pageX + "px";
        return false;
    }
    
    function onCallRouter (event) {
        callRouter(selRace.value);
    }

    function callRouter (raceId, userId = currentUserId, auto = false) {
        if (selRace.selectedIndex == -1) {
            alert("Race info not available - please reload VR Offshore");
            return;
        }

        var race = races.get(raceId);
        if (!race) {
            alert("Unsupported race #" + raceId);
            return;
        }

        // Get boat status
        var isMe = (userId == currentUserId);
        var userInfo = (isMe) ? race.curr : raceFleetMap.get(raceId).uinfo[userId];
        if (!userInfo) {
            alert("No position received yet. Please retry later.");
            return;
        }

        callRouterZezo(race, userInfo, isMe, auto);

    }

    function callRouterZezo (race, userInfo, isMe, auto) {

        // Zezo race set up?
        if (race.url === undefined) {
            alert("Unsupported race, no router support yet.");
            return;
        }

        // Ask user confirmation if position is stale
        if (userInfo.lastCalcDate) {
            var now = new Date();
            if ((now - userInfo.lastCalcDate) > 750000) {
                console.log("Confirm routing for stale position?");
                // If the Dashboard tab is not active, confirm does NOT raise a popup
                // and returns false immediately.
                // This means the router will not be auto-called with a stale position.
                if (! confirm("Position is older than 10min, really call router?")) {
                    console.log("Confirm routing ==> cancel.");
                    return;
                } else {
                    console.log("Confirm routing ==> confirmed.");
                }
            }
        }

        var baseURL = `http://zezo.org/${race.url}/chart.pl`;

        var optionBits = {
            "winch": 4,
            "foil": 16,
            "light": 32,
            "reach": 64,
            "heavy": 128
        };

        var pos = userInfo.pos;
        var twa = userInfo.twa;

        var options = 0;
        if (userInfo.options) {
            for (const option of userInfo.options) {
                if (optionBits[option]) {
                    options |= optionBits[option];
                }
            }
        }

        var url = baseURL
            + "?lat=" + pos.lat
            + "&lon=" + pos.lon
            + "&clat=" + pos.lat
            + "&clon=" + pos.lon
            + "&ts=" + (race.curr.lastCalcDate / 1000)
            + "&o=" + options
            + "&twa=" + twa
            + "&userid=" + getUserId(userInfo)
            + "&type=" + (isMe ? "me":"friend")
            + "&auto=" + (auto ? "yes" : "no")
        window.open(url, cbReuseTab.checked ? baseURL : "_blank");
    }
    
    function reInitUI (newId) {
        if (currentUserId != undefined && currentUserId != newId) {
            // Re-initialize statistics
            disableRaces();
            races.forEach(function (race) {
                race.tableLines = [];
                race.curr = undefined;
                race.prev = undefined;
                race.lastCommand = undefined;
                race.rank = undefined;
                race.dtl = undefined;
                race.gmap = undefined;
            });
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            divRecordLog.innerHTML = makeTableHTML();
            updateFleetHTML();
        };
    }

    function getUserId (message) {
        return (message._id)?message._id.user_id:message.userId;
    }

    // Helper function: Invoke debugger command
    function sendDebuggerCommand (debuggeeId, params, command, callback) {
        try {
            chrome.debugger.sendCommand({ tabId: debuggeeId.tabId }, command, { requestId: params.requestId }, callback);
        } catch (e) {
            console.log(e);
        }
    }

    function sleep (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function handleResponseReceived (debuggeeId, params) {
        // How does Networl.getResponseBody work, anyway?!
        await sleep(3000);
        sendDebuggerCommand(debuggeeId, params, "Network.getResponseBody", (response) => {_handleResponseReceived(xhrMap.get(params.requestId), response)});
    }

    function _handleResponseReceived(request, response) {
        var postData = JSON.parse(request.postData);
        var eventClass = postData['@class'];
        var body = JSON.parse(response.body.replace(/\bNaN\b|\bInfinity\b/g, "null"));
        if (eventClass == 'AccountDetailsRequest') {
            handleAccountDetailsResponse(body);
        } else if (eventClass == 'LogEventRequest') {
            var eventKey = postData.eventKey;
            if (eventKey == 'Leg_GetList') {
                handleLegGetListResponse(body);
            } else if (eventKey == 'Meta_GetPolar') {
                handleMetaGetPolar(body);
            } else if (eventKey == 'Game_AddBoatAction' ) {
                handleGameAddBoatAction(postData, body);
            } else if (eventKey == "Game_GetGhostTrack") {
                handleGameGetGhostTrack(postData, body);
            } else if (eventKey == "User_GetCard") {
                handleUserGetCard(postData, body);
            }  else if (ignoredMessages.includes(eventKey)) {
                console.info("Ignored eventKey " + eventKey);
            } else {
                console.info("Unhandled logEvent " + JSON.stringify(response) + " with eventKey " + eventKey);
            }
        } else {
            var event = request.url.substring(request.url.lastIndexOf('/') + 1);
            if (event == 'getboatinfos') {
                handleBoatInfo(response);
            } else if (event == 'getfleet') {
                handleFleet(request, response);
            } else {
                console.info("Unhandled request " + request.url + "with response" + JSON.stringify(response));
            }
        }
    }

    function handleAccountDetailsResponse (response) {
        reInitUI(response.userId);
        currentUserId = response.userId;
        lbBoatname.innerHTML = response.displayName;
        if (response.scriptData.team) {
            lbTeamname.innerHTML = response.scriptData.team.name;
            currentTeam = response.scriptData.team.name;
        }
    }

    function handleBoatInfo (response)  {
        if (response) {
            if (cbRawLog.checked) {
                divRawLog.innerHTML = divRawLog.innerHTML + "\n" + "<<< " + JSON.stringify(response);
            }
            try {
                var message = JSON.parse(response.body).res;
                if (message.leg) {
                    if (message.bs && (! currentUserId)) {
                        // Don't overwrite currentUserId if it's defined.
                        // When the user changes boats, we either receive an account message, or Dashboard was restartet.
                        currentUserId = message.bs._id.user_id;
                    }
                    handleLegInfo(message.leg);
                }
                if (message.bs) {
                    if (!currentUserId) {
                        alert("Logged-on user is unknown, please exit and re-enter VR Offshore!");
                        return;
                    }
                    if (currentUserId ==  message.bs._id.user_id) {
                        var isFirstBoatInfo = (message.leg != undefined);
                        handleOwnBoatInfo(message.bs, isFirstBoatInfo);
                    } else {
                        handleFleetBoatInfo(message.bs);
                    }
                }
                if (message.track) {
                    if (message.track._id.user_id == currentUserId) {
                        handleOwnTrackInfo(message.track);
                    } else {
                        // Ignore track info.
                        // There is currently no function to update a single competitor track.
                    }
                }
                if (message.ba) {
                    handleBoatActions(message.ba);
                }

            } catch (e) {
                console.log(e + " at " + e.stack);
            }
        }
    }

    function handleFleet (request, response) {
        if (response) {
            if (cbRawLog.checked) {
                divRawLog.innerHTML = divRawLog.innerHTML + "\n" + "<<< " + JSON.stringify(response);
            }
            try {
                var requestData = JSON.parse(request.postData);
                var raceId = getRaceLegId(requestData);
                var race = races.get(raceId);
                var message = JSON.parse(response.body).res;
                updateFleet(raceId, "fleet", message);
                updateFleetHTML(raceFleetMap.get(selRace.value));
                updateMapFleet(race);
            } catch (e) {
                console.log(e + " at " + e.stack);;
            }
        }
    }

    function handleOwnBoatInfo (message, isFirstBoatInfo) {
        var raceId = getRaceLegId(message._id);
        var race = races.get(raceId);
        updatePosition(message, race);
        if (isFirstBoatInfo && cbRouter.checked) {
            callRouter(raceId, currentUserId, true);
        }
        // Add own info on Fleet tab
        mergeBoatInfo(raceId, "usercard", message._id.user_id, message);
    }

    function handleOwnTrackInfo (message) {
        var raceId = getRaceLegId(message._id);
        var race = races.get(raceId);
        updateMapMe(race, message.track);
    }

    function handleFleetBoatInfo (message) {
        var raceId = getRaceLegId(message._id);
        var race = races.get(raceId);
        var userId = getUserId(message);
        if ( (!race.bestDTF) || (message.distanceToEnd < race.bestDTF) ) {
            race.bestDTF = message.distanceToEnd;
        }
        makeRaceStatusHTML();
        makeTableHTML(race);
        mergeBoatInfo(raceId, "usercard", userId, message);
        updateFleetHTML(raceFleetMap.get(selRace.value));
        updateMapFleet(race);
        document.dispatchEvent(new Event('change'))
    }

    function handleLegInfo (message) {
        // ToDo - refactor updateFleetUinfo message
        var raceId = getRaceLegId(message._id);
        var race = races.get(raceId);
        race.legdata = message;
        initializeMap(race);
    }

    function handleBoatActions (message) {
        for (const action of message) {
            var raceId = getRaceLegId(action._id);
            var race = races.get(raceId);
            if (action.pos) {
                race.waypoints = action;
                updateMapWaypoints(race);
            }
        }
    }

    function noticeGFSCycle (params) {
        console.log("Loading wind " + params.request.url.substring(45));
        if ( params.request.url.endsWith('wnd') ) {
            var cycleString = params.request.url.substring(45, 56);
            var d = parseInt(cycleString.substring(0, 8));
            var c = parseInt(cycleString.substring(9, 11));
            var cycle = d * 100 + c;
            if (cycle > currentCycle) {
                currentCycle = cycle;
                lbCycle.innerHTML = cycleString;
            }
        }
    }

    function handleLegGetListResponse (response) {
        // Contains destination coords, ice limits
        // ToDo: contains Bad Sail warnings. Show in race status table?
        var legInfos = response.scriptData.res;
        legInfos.map(function (legInfo) {
            var rid = legId(legInfo);
            var race = races.get(rid);
            if (race === undefined) {
                race = {
                    id: rid,
                    name: legInfo.legName,
                    legName: legInfo.legName,
                    source: "vr_leglist"
                };
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
            if (legInfo.problem == "badSail") {} else if (legInfo.problem == "...") {}
        });
        divRaceStatus.innerHTML = makeRaceStatusHTML();
    }

    function handleGameAddBoatAction (request, response) {
        // First boat state message, only sent for the race the UI is displaying
        var raceId = getRaceLegId(request);
        var race = races.get(raceId);
        if (race != undefined) {
            race.lastCommand = {
                request: request,
                rc: response.scriptData.rc
            };
            addTableCommandLine(race);
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            clearTrack(race.gmap,"_db_wp");
            if (response.scriptData.boatActions) {
                handleBoatActions(response.scriptData.boatActions);
            }
        }
    }

    function handleMetaGetPolar (response) {
        // Always overwrite cached data...
        polars[response.scriptData.polar._id] = response.scriptData.polar;
        chrome.storage.local.set({
            "polars": polars
        });
        console.info("Stored polars " + response.scriptData.polar.label);
    }

    function handleGameGetGhostTrack (request, response) {
        var raceId = getRaceLegId(request);
        var fleet = raceFleetMap.get(raceId);
        var race = races.get(raceId);
        var uid = request.user_id;
        
        if (race) {
            race.leaderTrack = response.scriptData.leaderTrack;
            race.leaderName =  response.scriptData.leaderName;
            if (response.scriptData.myTrack) {
                race.myTrack = response.scriptData.myTrack;
            }
            updateMapLeader(race);
        }
    }

    function handleUserGetCard (request, response) {
        var raceId = getRaceLegId(request);
        var uid = request.user_id;
        if ( response.scriptData.baseInfos
             && response.scriptData.legInfos
             && response.scriptData.legInfos.type) {
            mergeBoatInfo(raceId, "usercard", uid, response.scriptData.baseInfos);
            mergeBoatInfo(raceId, "usercard", uid, response.scriptData.legInfos);
            if (raceId == selRace.value) {
                updateFleetHTML(raceFleetMap.get(selRace.value));
            }
            var race = races.get(raceId);
            updateMapFleet(race);
        }
    }
    
    function handleWebSocketFrameSent (params) {
        // Append message to raw log
        if (cbRawLog.checked) {
            divRawLog.innerHTML = divRawLog.innerHTML + "\n" + ">>> " + params.response.payloadData;
        }
        
        // Map to request type via requestId
        var request = JSON.parse(params.response.payloadData);
        requests.set(request.requestId, request);
        
        if (request.eventKey == "Game_StartAttempt") {
            var raceId = getRaceLegId(request);
            var race = races.get(raceId);
            if (race) {
                race.prev = undefined;
                race.curr = undefined;
            }
        }
    }

    function handleWebSocketFrameReceived (params) {
        // Append message to raw log
        if (cbRawLog.checked) {
            divRawLog.innerHTML = divRawLog.innerHTML + "\n" + "<<< " + params.response.payloadData;
        }
        // Work around broken message
        var jsonString = params.response.payloadData.replace(/\bNaN\b|\bInfinity\b/g, "null");
        var response = JSON.parse(jsonString);
        if (response == undefined) {
            console.log("Invalid JSON in payload");
        } else {
            var responseClass = response["@class"];
            if (responseClass == ".AccountDetailsResponse") {
                handleAccountDetailsResponse();
            } else if (responseClass == ".LogEventResponse") {
                // Get the matching request and Dispatch on request type
                var request = requests.get(response.requestId);
                
                // Dispatch on request type
                if (request == undefined) {
                    // Probably only when debugging.
                    // -- save and process later ?
                    console.warn(responseClass + " " + response.requestId + " not found");
                } else if (request.eventKey == "Leg_GetList") {
                    handleLegGetListResponse(response);
                } else if (request.eventKey == "Game_AddBoatAction") {
                    handleGameAddBoatAction(postData, response);
                } else if (request.eventKey == "Meta_GetPolar") {
                    handleMetaGetPolar(response);
                } else if (request.eventKey == "Game_GetGhostTrack") {
                    handleGameGetGhostTrack(request, response);
                } else if (request.eventKey == "User_GetCard") {
                    handleUserGetCard(request, response);
                } else if (ignoredMessages.includes(eventKey)) {
                    console.info("Ignored eventKey " + eventKey);
                } else {
                    console.warn("Unhandled logEvent " + JSON.stringify(response) + " with eventKey " + eventKey);
                }
            }
        }
    }
    
    function onEvent (debuggeeId, message, params) {
        if ( tabId != debuggeeId.tabId ) return;

        if ( message == "Network.requestWillBeSent" && params && params.request && params.request.url) {
            if  ( params.request.method == "POST" &&
                  ( params.request.url.startsWith("https://prod.vro.sparks.virtualregatta.com")
                    || params.request.url.startsWith("https://vro-api-ranking.prod.virtualregatta.com")
                    || params.request.url.startsWith("https://vro-api-client.prod.virtualregatta.com"))
                ) {
                if (cbRawLog.checked && params) {
                    divRawLog.innerHTML = divRawLog.innerHTML + "\n" + ">>> " + JSON.stringify(params.request);
                }
                xhrMap.set(params.requestId, params.request);
            } else if ( params.request.url.substring(0, 45) == "https://static.virtualregatta.com/winds/live/" ) {
                noticeGFSCycle(params);
            }
        } else if (message == "Network.responseReceived") {
            var request = xhrMap.get(params.requestId);
            if (request) {
                // if ( params && params.response && params.response.url == "https://vro-api-client.prod.virtualregatta.com/getboatinfos" ) {
                //     handleBoatInfo(debuggeeId, params);
                // } else if ( params && params.response && params.response.url == "https://vro-api-client.prod.virtualregatta.com/getfleet" ) {
                //     handleFleet(debuggeeId, params);
                // }
                handleResponseReceived(debuggeeId, params);
            }
        } else if (message == "Network.webSocketFrameSent") {
            handleWebSocketFrameSent(params);
        } else if (message == "Network.webSocketFrameReceived") {
            handleWebSocketFrameReceived(params);
        }
    }
        
    function setUp () {

        var manifest = chrome.runtime.getManifest();        
        document.getElementById("lb_version").innerHTML = manifest.version;

        lbBoatname = document.getElementById("lb_boatname");
        lbTeamname = document.getElementById("lb_teamname");
        selRace = document.getElementById("sel_race");
        lbCycle = document.getElementById("lb_cycle");
        selNmeaport = document.getElementById("sel_nmeaport");
        selFriends = document.getElementById("sel_skippers");
        cbFriends = document.getElementById("sel_friends");
        cbOpponents = document.getElementById("sel_opponents");
        cbCertified = document.getElementById("sel_certified");
        cbTeam = document.getElementById("sel_team");
        cbTop = document.getElementById("sel_top");
        cbReals = document.getElementById("sel_reals");
        cbSponsors = document.getElementById("sel_sponsors");
        cbInRace = document.getElementById("sel_inrace");
        cbRouter = document.getElementById("auto_router");
        cbMarkers = document.getElementById("markers");
        cbReuseTab = document.getElementById("reuse_tab");
        cbLocalTime = document.getElementById("local_time");
        cbNMEAOutput = document.getElementById("nmea_output");
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
        cbRawLog = document.getElementById("cb_rawlog");
        divRawLog = document.getElementById("rawlog");

        document.getElementById("bt_router").addEventListener("click", onCallRouter);
        document.getElementById("sel_race").addEventListener("change", changeRace);
        document.getElementById("sel_skippers").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_friends").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_opponents").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_team").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_top").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_reals").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_sponsors").addEventListener("change", updateFleetFilter);
        document.getElementById("sel_inrace").addEventListener("change", updateFleetFilter);
        document.getElementById("bt_clear").addEventListener("click", clearLog);
        
        document.addEventListener("click", tableClick);
        document.addEventListener("resize", resize);

        initRaces();

        chrome.storage.local.get("polars", function (items) {
            if (items["polars"] !== undefined) {
                console.log("Retrieved " + items["polars"].filter(function (value) {
                    return value != null
                }).length + " polars.");
                polars = items["polars"];
            }
        });
        
        selNmeaport.addEventListener("change", function (e) {
            console.log("Setting proxyPort = " +  selNmeaport.value); 
            NMEA.settings.proxyPort = selNmeaport.value;
        });
        
        cbNMEAOutput.addEventListener("change", function (e) {
            if (cbNMEAOutput.checked) {
                console.log("Starting NMEA");
                NMEA.start(races, raceFleetMap, isDisplayEnabled);
            } else {
                console.log("Stopping NMEA");
                NMEA.stop();
            }
        });
        
        // Set stored options after connectiing event listeners
        readOptions();
        addConfigListeners();
        
        chrome.debugger.sendCommand({
            tabId: tabId
        }, "Network.enable", function () {
            // just close the dashboard window if debugger attach fails
            // wodks on session restore too
            
            if (chrome.runtime.lastError) {
                window.close();
                return;
            }
        });
        chrome.debugger.onEvent.addListener(onEvent);
    };

    document.addEventListener("DOMContentLoaded", function (event) {
        setUp();
    });
    
}) ();
