// UI Controller

var controller = function () {

    const LightRed = '#ffa0a0';

    // ToDo: clear stats if user/boat changes
    var currentUserId;
    var requests = new Map();

    // Polars and other game parameters, indexed by polar._id
    var polars = [];

    var races = new Map();
    var racefriends = new Map();
    var sortField = "none";
    var currentSortField = "none";
    var currentSortOrder = 0;
    var sailNames = [0, "Jib", "Spi", "Stay", "LJ", "C0", "HG", "LG", 8, 9,
                     // VR sends sailNo + 10 to indicate autoSail. We use sailNo mod 10 to find the sail name sans Auto indication.
                     "Auto", "Jib (Auto)", "Spi (Auto)", "Stay (Auto)", "LJ (Auto)", "C0 (Auto)", "HG (Auto)", "LG (Auto)"];
    var longSailNames = ["", "JIB", "SPI", "STAYSAIL", "LIGHT_JIB", "CODE_0", "HEAVY_GNK", "LIGHT_GNK"];

    function addSelOption(race, beta, disabled) {
        var option = document.createElement("option");
        option.text = race.name + (beta ? " beta" : "");
        option.value = race.id;
        option.betaflag = beta;
        option.disabled = disabled;
        selRace.appendChild(option);
    }

    function initRace(race, disabled) {
        race.tableLines = [];
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
        xhr.onload = function () {
            var json = xhr.responseText;
            json = JSON.parse(json);
            for (var i = 0; i < json.races.length; i++) {
                json.races[i].source = "zezo";
                initRace(json.races[i], true);
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
    var radius = 3437.74683

    var selRace, cbRouter, cbReuseTab, cbLocalTime;
    var lbBoatname;
    var divPositionInfo, divRecordLog, divRawLog;
    var callRouterFunction;
    var initialized = false;

    var tableHeader = '<tr>' +
        '<th>' + 'Time' + '</th>' +
        commonHeaders() +
        '<th title="Reported speed">' + 'vR (kn)' + '</th>' +
        '<th title="Calculated speed (Δd/Δt)">' + 'vC (kn)' + '</th>' +
        '<th title="Polar-derived speed">' + 'vT (kn)' + '</th>' +
        '<th title="Foiling factor">' + 'Foils' + '</th>' +
        '<th title="Calculated distance">' + 'Δd (nm)' + '</th>' +
        '<th title="Time between positions">' + 'Δt (s)' + '</th>' +
        '<th title="Sail change time remaining">' + 'Sail' + '</th>' +
        '<th title="Gybing time remaining">' + 'Gybe' + '</th>' +
        '<th title="Tacking time remaining">' + 'Tack' + '</th>' +
        '</tr>';

    var raceStatusHeader = '<tr>' +
        '<th title="Call Router">' + 'RT' + '</th>' +
        '<th title="Call Polars">' + 'PL' + '</th>' +
        '<th title="Call WindInfo">' + 'WI' + '</th>' +
        '<th>' + 'Race' + '</th>' +
        commonHeaders() +
        '<th title="Boat speed">' + 'Speed' + '</th>' +
        '<th>' + 'Options' + '</th>' +
        '<th>' + 'Cards' + '</th>' +
        '<th title="Time to next barrel">' + 'Pack' + '</th>' +
        '<th title="Boat is aground">' + 'Agnd' + '</th>' +
        '<th title="Boat is maneuvering, half speed">' + 'Mnvr' + '</th>' +
        '<th>' + 'Last Command' + '</th>' +
        '</tr>';

    function friendListHeader() {
        return '<tr>' +
            genth("th_rt", "RT", "Call Router", sortField == 'none', undefined) +
            genth("th_name", "Friend/Opponent", undefined, sortField == 'displayName', currentSortOrder) +
            genth("th_lu", "Last Update", undefined) +
            genth("th_rank", "Rank", undefined, sortField == 'rank', currentSortOrder) +
            genth("th_dtf", "DTF", "Distance to Finish", sortField == 'distanceToEnd', currentSortOrder) +
            genth("th_dtu", "DTU", "Distance to Us", sortField == 'distanceToUs', currentSortOrder) +
            genth("th_brg", "BRG", "Bearing from Us", undefined) +
            genth("th_sail", "Sail", undefined) +
            genth("th_state", "State", undefined, sortField == 'state', currentSortOrder) +
            genth("th_psn", "Position", undefined) +
            genth("th_hdg", "HDG", "Heading", sortField == 'heading', currentSortOrder) +
            genth("th_twa", "TWA", "True Wind Angle", sortField == 'twa', currentSortOrder) +
            genth("th_tws", "TWS", "True Wind Speed", sortField == 'tws', currentSortOrder) +
            genth("th_speed", "Speed", "Boat Speed", sortField == 'speed', currentSortOrder) +
            genth("th_factor", "Factor", "Speed factor over no-options boat", undefined) +
            genth("th_foils", "Foils", "Boat assumed to have Foils. Unknown if no foiling conditions", undefined) +
            genth("th_hull", "Hull", "Boat assumed to have Hull polish", undefined) +
            '</tr>';
    }

    function genth(id, content, title, sortfield, sortmark) {
        if (sortfield && sortmark != undefined) {
            content = content + " " + (sortmark ? '&#x25b2;' : '&#x25bc;');
        }
        return "<th id='" + id + "'" +
            (sortfield ? " style='color:BlueViolet;'" : "") +
            (title ? (" title='" + title + "'") : "") +
            ">" + content + "</th>";
    }

    function commonHeaders() {
        return '<th>' + 'Rank' + '</th>' +
            '<th title="Distance To Leader">' + 'DTL' + '</th>' +
            '<th title="Distance To Finish">' + 'DTF' + '</th>' +
            '<th>' + 'Position' + '</th>' +
            '<th title="Heading">' + 'HDG' + '</th>' +
            '<th title="True Wind Angle">' + 'TWA' + '</th>' +
            '<th title="True Wind Speed">' + 'TWS' + '</th>' +
            '<th title="True Wind Direction"> ' + 'TWD' + '</th>' +
            '<th title="Auto Sail time remaining">' + 'aSail' + '</th>';
    }

    function printLastCommand(lcActions) {
        var lastCommand = "";

        lcActions.map(function (action) {
            if (action.type == "heading") {
                lastCommand += (action.autoTwa ? " TWA" : " HDG") + '=' + roundTo(action.value, 1);
            } else if (action.type == "sail") {
                lastCommand += ' Sail=' + sailNames[action.value];
            } else if (action.type == "prog") {
                action.values.map(function (progCmd) {
                    var progTime = formatDate(progCmd.ts);
                    lastCommand += (progCmd.autoTwa ? " TWA" : " HDG") + "=" + roundTo(progCmd.heading, 1) + ' @ ' + progTime + "; ";
                });
            } else if (action.type == "wp") {
                action.values.map(function (waypoint) {
                    lastCommand += " WP: " + formatPosition(waypoint.lat, waypoint.lon) + "; ";
                });
            }
        });
        return lastCommand;
    }

    function commonTableLines(r) {

        var sailInfo = sailNames[r.curr.sail % 10];
        var isAutoSail = ((r.curr.tsEndOfAutoSail - r.curr.lastCalcDate) > 0);
        if (isAutoSail) {
            sailInfo = sailInfo + ' (A ' + formatHMS(r.curr.tsEndOfAutoSail - r.curr.lastCalcDate) + ')';
        } else {
            sailInfo = sailInfo + ' (Man)';
        }

        var sailNameBG = r.curr.badSail ? LightRed : "lightgreen";

        var twaFG = (r.curr.twa < 0) ? "red" : "green";
        var twaBold = r.curr.twaAuto ? "font-weight: bold;" : "";
        var hdgFG = r.curr.twaAuto ? "black" : "blue";
        var hdgBold = r.curr.twaAuto ? "font-weight: normal;" : "font-weight: bold;";

        return "<td>" + ((r.rank) ? r.rank : "-") + "</td>" +
            "<td>" + ((r.dtl) ? r.dtl : "-") + "</td>" +
            "<td>" + roundTo(r.curr.distanceToEnd, 1) + "</td>" +
            "<td>" + formatPosition(r.curr.pos.lat, r.curr.pos.lon) + "</td>" +
            '<td style="color:' + hdgFG + ';' + hdgBold + '">' + roundTo(r.curr.heading, 1) + "</td>" +
            '<td style="color:' + twaFG + ';' + twaBold + '">' + roundTo(Math.abs(r.curr.twa), 1) + "</td>" +
            "<td>" + roundTo(r.curr.tws, 2) + "</td>" +
            "<td>" + roundTo(r.curr.twd, 1) + "</td>" +
            "<td style='background-color:" + sailNameBG + ";'>" + sailInfo + "</td>";
    }

    function makeRaceStatusLine(pair) {
        var r = pair[1];
        if (r.curr == undefined) {
            return "";
        } else {

            var agroundBG = r.curr.aground ? LightRed : "lightgreen";

            var manoeuvering = (r.curr.tsEndOfSailChange > r.curr.lastCalcDate) ||
                (r.curr.tsEndOfGybe > r.curr.lastCalcDate) ||
                (r.curr.tsEndOfTack > r.curr.lastCalcDate);

            var lastCommand = "-";
            var lastCommandBG = "";
            if (r.lastCommand != undefined) {
                // ToDo: error handling; multiple commands; expiring?
                var lcTime = formatTime(r.lastCommand.request.ts);
                lastCommand = printLastCommand(r.lastCommand.request.actions);
                lastCommand = "T:" + lcTime + ' Actions:' + lastCommand;
                if (r.lastCommand.rc != "ok") {
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
                for (var key in r.curr.cards) {
                    cards = cards + " " + key + ":" + r.curr.cards[key];
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
            if (r.type === "leg") {
                info = "<span>" + r.legName + "</span>";
            } else if (r.type === "record") {
                info = " <span>Record, Attempt " + parseInt(r.record.attemptCounter) + "</span>";
            }
            if (r.type === "record" && r.record.lastRankingGateName) {
                info += "<br/><span>@" + r.record.lastRankingGateName + "</span>";
            }

            var trstyle = "hov";
            if (r.id === selRace.value) trstyle += " sel";
            return "<tr class='" + trstyle + "' id='rs:" + r.id + "'>" +
                (r.url ? ("<td class='tdc'><span id='rt:" + r.id + "'>&#x2388;</span></td>") : "<td>&nbsp;</td>") +
                "<td class='tdc'><span id='pl:" + r.id + "'>&#x26F5;</span></td>" +
                "<td class='tdc'><span id='wi:" + r.id + "'><img class='icon' src='wind.svg'/></span></td>" +
                "<td>" + r.name + "</td>" +
                commonTableLines(r) +
                "<td>" + roundTo(r.curr.speed, 2) + "</td>" +
                "<td>" + ((r.curr.options.length == 8) ? 'Full' : r.curr.options.join(' ')) + "</td>" +
                "<td>" + cards + "</td>" +
                "<td" + regColor + ">" + regPack + "</td>" +
                '<td style="background-color:' + agroundBG + ';">' + ((r.curr.aground) ? "AGROUND" : "No") + "</td>" +
                "<td>" + (manoeuvering ? "Yes" : "No") + "</td>" +
                '<td style="background-color:' + lastCommandBG + ';">' + lastCommand + "</td>" +
                "</tr>";
        }
    }

    function boatinfo(uinfo) {
        var res = {
            name: uinfo.displayName,
            nameStyle: "",
            speed: roundTo(uinfo.speed, 2),
            heading: roundTo(uinfo.heading, 1),
            tws: roundTo(uinfo.tws, 1),
            twa: roundTo(Math.abs(uinfo.twa), 1),
            bcolor: '#26a'
        };

        if (uinfo.mode == "followed") {
            res.nameStyle = "font-weight: bold; ";
            res.bcolor = '#a6b';
        }
        if (uinfo.type == "top") {
            res.nameStyle += "color: DarkGoldenRod;";
            res.bcolor = 'DarkGoldenRod';
        }
        if (uinfo.type == "real") {
            res.nameStyle += "color: DarkGreen;";
            res.bcolor = 'DarkGreen';
        }
        if (uinfo.type == "sponsor") {
            res.nameStyle += "color: BlueViolet;";
            res.name += "(" + uinfo.bname + ")";
            res.bcolor = 'BlueViolet';
        }
        res.twaStyle = "style='color:" + ((uinfo.twa < 0) ? "red" : "green") + ";'";
        res.sail = sailNames[uinfo.sail] || '-';

        res.xfactorStyle = "style='color:" + ((uinfo.xplained) ? "black" : "red") + ";'";
        return (res);
    }

    function makeFriendListLine(uid) {
        if (uid == undefined) {
            return "";
        } else {
            var r = this.uinfo[uid];
            var race = races.get(selRace.value);

            if (r == undefined) {
                return "";
            }

            var bi = boatinfo(r);

            if (!r.distanceToEnd || r.distanceToEnd == "null") {
                r.distanceToEnd = '(' + roundTo(gcDistance(r.pos.lat, r.pos.lon, race.legdata.end.lat, race.legdata.end.lon), 1) + ')';
            }

            return "<tr class='hov' id='ui:" + uid + "'>" +
                (race.url ? ("<td class='tdc'><span id='rt:" + uid + "'>&#x2388;</span></td>") : "<td>&nbsp;</td>") +
                '<td style="' + bi.nameStyle + '">' + bi.name + "</td>" +
                "<td>" + formatDate(r.ts) + "</td>" +
                "<td>" + (r.rank ? r.rank : "-") + "</td>" +
                "<td>" + r.distanceToEnd + "</td>" +
                "<td>" + (r.distanceToUs ? r.distanceToUs : "-") + "</td>" +
                "<td>" + (r.bearingFromUs ? r.bearingFromUs + "&#x00B0;" : "-") + "</td>" +
                "<td>" + bi.sail + "</td>" +
                "<td>" + (r.state || '-') + "</td>" +
                "<td>" + (r.pos ? formatPosition(r.pos.lat, r.pos.lon) : "-") + "</td>" +
                "<td>" + bi.heading + "</td>" +
                "<td " + bi.twaStyle + ">" + bi.twa + "</td>" +
                "<td>" + bi.tws + "</td>" +
                "<td>" + bi.speed + "</td>" +
                "<td " + bi.xfactorStyle + ">" + roundTo(r.xfactor, 4) + "</td>" +
                "<td>" + (r.xoption_foils || '?') + "</td>" +
                "<td>" + (r.xoption_hull || '?') + "</td>" +
                "</tr>";
        }
    }

    function makeRaceStatusHTML() {
        return "<table style=\"width:100%\">" +
            raceStatusHeader +
            Array.from(races || []).map(makeRaceStatusLine).join(' '); +
            "</table>";
    }

    function makeFriendsHTML(rf) {
        var field = "speed";
        if (rf === undefined) {
            return "No friend positions received yet";
        } else {
            sortFriends(rf);
            return "<table style=\"width:100%\">" +
                "<thead class=\"sticky\">" +
                friendListHeader() +
                "</thead>" +
                "<tbody>" +
                Array.from(rf.table || []).map(makeFriendListLine, rf).join(' '); +
                "</tbody>" +
                "</table>";
        }
    }

    function makeTableHTML(r) {
        return "<table style=\"width:100%\">" +
            "<thead class=\"sticky\">" +
            tableHeader +
            "</thead>" +
            "<tbody>" +
            (r === undefined ? "" : r.tableLines.join(' ')) +
            "</tbody>" +
            "</table>";
    }

    function updateFriendUinfo(rid, mode, uid, data) {
        var rfd = racefriends.get(rid);
        var race = races.get(rid);
        var ndata = rfd.uinfo[uid];
        var boatPolars = (data.boat) ? polars[data.boat.polar_id] : undefined;

        if (data.pos == undefined) return; // looked up user not in this race
        if (!ndata) {
            ndata = new Object();
            rfd.uinfo[uid] = ndata;
        }
        if (mode == "usercard") {
            data.mode = "opponents";
            data.ts = data.lastCalcDate;
            if (data.ts < ndata.ts) data.ts = ndata.ts;
        }
        if (ndata.mode == "followed") data.mode = "followed"; // keep followed state if present

        var elemlist = ["baseInfos", "displayName", "ts", "type", "state", "pos", "heading", "twa", "tws", "speed", "mode", "distanceToEnd", "sail", "bname"];
        // copy elems from data to uinfo
        elemlist.forEach(function (tag) {
            if (tag in data) {
                ndata[tag] = data[tag];
                if (tag == "baseInfos") {
                    ndata.displayName = data["baseInfos"].displayName;
                } else if (tag == "pos") { // calc gc distance to us
                    ndata.distanceToUs = roundTo(gcDistance(race.curr.pos.lat, race.curr.pos.lon, data.pos.lat, data.pos.lon), 1);
                    ndata.bearingFromUs = roundTo(courseAngle(race.curr.pos.lat, race.curr.pos.lon, data.pos.lat, data.pos.lon) * 180 / Math.PI, 1);
                    var ad = ndata.bearingFromUs - race.curr.heading + 90;
                    if (ad < 0) ad += 360;
                    if (ad > 360) ad -= 360;
                    if (ad > 180) ndata.distanceToUs = -ndata.distanceToUs; // 'behind' us
                }
            }
        });

        if (boatPolars) {
            var sailName = longSailNames[data.sail % 10];
            var sailDef = getSailDef(boatPolars.sail, sailName);

            // 'Real' boats have no sail info
            if (sailDef) {
                var iA = fractionStep(data.twa, boatPolars.twa);
                var iS = fractionStep(data.tws, boatPolars.tws);

                // 'Plain' speed 
                var speedT = pSpeed(iA, iS, sailDef.speed);
                // Speedup factors
                var foilFactor = foilingFactor(["foil"], data.tws, data.twa, boatPolars.foil);
                var hullFactor = boatPolars.hull.speedRatio;

                // Explain ndata.speed from plain speed and speedup factors
                explain(ndata, foilFactor, hullFactor, speedT);
            }

        } else {
            ndata.xplained = true;
            ndata.xfactor = 1.0;
            ndata.xoption_foils = '---';
            ndata.xoption_hull = '---';
        }

        if (data["rank"] > 0) ndata["rank"] = data["rank"];
    }

    function explain(ndata, foilFactor, hullFactor, speedT) {
        ndata.xfactor = ndata.speed / speedT;
        ndata.xoption_foils = '?';
        ndata.xoption_hull = 'no';
        ndata.xplained = false;

        if (epsEqual(ndata.xfactor, 1.0)) {
            // Speed agrees with 'plain' speed.
            // Explanation: 1. no hull and 2. foiling condition => no foils.
            ndata.xplained = true;
            if (foilFactor > 1.0) {
                ndata.xoption_foils = 'no';
            }
        } else {
            // Speed does not agree with plain speed.
            // Check if hull, foil or hull+foil can explain the observed speed.
            if (epsEqual(ndata.speed, speedT * hullFactor)) {
                ndata.xplained = true;
                if (epsEqual(hullFactor, foilFactor)) {
                    // Both hull and foil match.
                    ndata.xoption_hull = '(yes)';
                    ndata.xoption_foils = '(yes)';
                } else {
                    ndata.xoption_hull = 'yes';
                    if (foilFactor > 1.0) {
                        ndata.xoption_foils = 'no';
                    }
                }
            } else if (epsEqual(ndata.speed, speedT * foilFactor)) {
                ndata.xplained = true;
                ndata.xoption_foils = 'yes';
            } else if (epsEqual(ndata.speed, speedT * foilFactor * hullFactor)) {
                ndata.xplained = true;
                ndata.xoption_hull = 'yes';
                ndata.xoption_foils = 'yes';
            }
        }
    }

    function epsEqual(a, b) {
        return Math.abs(b - a) < 0.00001;
    }

    function sortFriends(rfd) {
        if (sortField != "none") {
            sortFriendsByField(rfd, sortField);
        } else {
            sortFriendsByCategory(rfd);
        }
    }

    function sortFriendsByField(rf, field) {
        rf.table.sort(function (uidA, uidB) {
            if (rf.uinfo[uidA] == undefined && rf.uinfo[uidB] == undefined) return 0;
            if (rf.uinfo[uidB] == undefined) return -1;
            if (rf.uinfo[uidA] == undefined) return 1;
            var entryA = rf.uinfo[uidA][field];
            var entryB = rf.uinfo[uidB][field];
            if (entryA == undefined && entryB == undefined) return 0;
            if (entryB == undefined) return -1;
            if (entryA == undefined) return 1;
            if (entryA.toString() == "NaN") entryA = 0;
            if (entryB.toString() == "NaN") entryB = 0;
            if (isNaN(entryA)) {
                if (entryA.substr(0, 1) == "(") {
                    entryA = entryA.slice(1, -1);
                } else {
                    entryA = entryA.toUpperCase();
                }
            }
            if (isNaN(entryB)) {
                if (entryB.substr(0, 1) == "(") {
                    entryB = entryB.slice(1, -1);
                } else {
                    entryB = entryB.toUpperCase();
                }
            }
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

    // generate sorted list, expire old entries
    function sortFriendsByCategory(rfd) {
        var fln = new Array();

        Object.keys(rfd.uinfo).forEach(function (key) {
            var elem = rfd.uinfo[key];
            // expire old uinfos from prior GetFollowed / GetOpponents
            if ((rfd.lastUpdate - elem.ts) > 30000) delete rfd.uinfo[key];
            else fln.push(key);
        });

        fln.sort(function (a, b) {
            var au = rfd.uinfo[a];
            var bu = rfd.uinfo[b];
            // followed before opponents
            if (au.mode != bu.mode) {
                if (au.mode == "followed") return -1;
                if (au.mode == "opponents") return 1;
            }
            if (au.mode == "opponents") {
                var classa = au.type;
                var classb = bu.type;
                // remap types sponsor and top to normal
                if (classa == "sponsor") classa = "normal";
                if (classb == "sponsor") classb = "normal";
                if (classa == "top") classa = "normal";
                if (classb == "top") classb = "normal";

                if (classa != classb) { // different types
                    // order: (normal|sponsor|top) , real, pilotBoat
                    if (classa == "normal") return -1;
                    if (classb == "normal") return 1;
                    if (classa == "real") return -1;
                    if (classb == "real") return 1;
                }
                if (au.rank && bu.rank) {
                    if (au.rank < bu.rank) return -1;
                    if (au.rank > bu.rank) return 1;
                    return 0;
                }
                if (au.rank && !bu.rank) return -1;
                if (bu.rank && !au.rank) return 1;
            }
            // followed or no rank, same type, sort on name
            return au.displayName.localeCompare(bu.displayName);
        });
        rfd.table = fln;
    }

    function updateFriends(rid, mode, data) {
        var rfd = racefriends.get(rid);
        rfd.lastUpdate = Date.now();

        data.forEach(function (delem) {
            delem.mode = mode;
            if (mode === "fleet") {
                if (delem.followed) {
                    delem.mode = "followed";
                } else if (delem.opponent) {
                    delem.mode = "opponents";
                } else {
                    delem.mode = "other";
                }
            } else {
                delem.mode = mode;
            }
            if (!delem.ts) delem.ts = Date.now();
            if (delem.type == "sponsor") {
                delem.bname = delem.branding.name;
            }
            if (delem.mode == "opponents") {
                if (delem.type == "pilotBoat") {
                    delem.displayName = "Frigate";
                } else if (delem.type == "real") {
                    delem.displayName = delem.extendedInfos.boatName;
                    delem.rank = delem.extendedInfos.rank;
                }
            }
            updateFriendUinfo(rid, mode, delem.userId, delem);
        });
        sortFriends(rfd);
    }

    function formatSeconds(value) {
        if (value < 0) {
            return "-";
        } else {
            return roundTo(value / 1000, 0);
        }
    }

    function formatHMS(seconds) {
        if (seconds === undefined || isNaN(seconds) || seconds < 0) {
            return '-';
        }

        seconds = Math.floor(seconds / 1000);

        var hours = Math.floor(seconds / 3600);
        seconds -= 3600 * hours;

        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;

        return pad0(hours) + 'h' + pad0(minutes) + 'm'; // + seconds + 's';
    }

    function formatMS(seconds) {
        if (seconds === undefined || isNaN(seconds) || seconds < 0) {
            return '-';
        }

        seconds = Math.floor(seconds / 1000);

        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;

        return pad0(minutes) + 'm' + pad0(seconds) + 's';
    }

    function formatDate(ts) {
        var tsOptions = {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
            timeZoneName: 'short'
        };
        var d = (ts) ? (new Date(ts)) : (new Date());
        if (cbLocalTime.checked) {} else {
            tsOptions.timeZone = 'UTC';
        }
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }

    function formatTime(ts) {
        var tsOptions = {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false
        };
        var d = (ts) ? (new Date(ts)) : (new Date());
        if (cbLocalTime.checked) {} else {
            tsOptions.timeZone = 'UTC';
        }
        return new Intl.DateTimeFormat("lookup", tsOptions).format(d);
    }

    function addTableCommandLine(r) {
        r.tableLines.unshift(
            "<tr>" +
            "<td>" + formatDate(r.lastCommand.request.ts) + "</td>" +
            "<td colspan='3'>Command @" + formatTime() + "</td>" +
            "<td colspan='15'>Actions:" + printLastCommand(r.lastCommand.request.actions) + "</td>" +
            "</tr>");
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function makeTableLine(r) {

        function isDifferingSpeed(speed) {
            return Math.abs(1 - r.curr.speed / speed) > 0.01;
        }

        function isCurrent(timestamp) {
            return (timestamp && (timestamp > r.prev.lastCalcDate));
        }

        function getBG(timestamp) {
            return isCurrent(timestamp) ? ('style="background-color: ' + LightRed + ';"') : '';
        }

        function isPenalty() {
            return isCurrent(r.curr.tsEndOfSailChange) ||
                isCurrent(r.curr.tsEndOfGybe) ||
                isCurrent(r.curr.tsEndOfTack);
        }

        var speedCStyle = '';
        var speedTStyle = '';
        var deltaDist = roundTo(r.curr.deltaD, 3);
        var speedT = '-';
        if (r.curr.speedT) {
            speedT = r.curr.speedT.speed + '&nbsp;(' + r.curr.speedT.sail + ')';
        }

        if (isPenalty()) {
            speedCStyle = 'style="background-color: ' + LightRed + ';"';
        } else if (isDifferingSpeed(r.curr.speedC)) {
            speedCStyle = 'style="background-color: yellow;"';
        } else if (r.curr.speedT && isDifferingSpeed(r.curr.speedT.speed)) {
            // Speed differs but not due to penalty - assume 'Bad Sail' and display theoretical delta
            speedTStyle = 'style="background-color: ' + LightRed + ';"';
            deltaDist = deltaDist + ' (' + roundTo(r.curr.deltaD_T, 3) + ')';
        }

        var sailChange = formatSeconds(r.curr.tsEndOfSailChange - r.curr.lastCalcDate);
        var gybing = formatSeconds(r.curr.tsEndOfGybe - r.curr.lastCalcDate);
        var tacking = formatSeconds(r.curr.tsEndOfTack - r.curr.lastCalcDate);

        return "<tr>" +
            "<td>" + formatDate(r.curr.lastCalcDate) + "</td>" +
            commonTableLines(r) +
            "<td>" + roundTo(r.curr.speed, 2) + "</td>" +
            "<td " + speedCStyle + ">" + roundTo(r.curr.speedC, 2) + ' (' + sailNames[(r.curr.sail % 10)] + ')' + "</td>" +
            "<td " + speedTStyle + ">" + speedT + "</td>" +
            "<td>" + (r.curr.speedT ? (roundTo(r.curr.speedT.foiling, 0) + '%') : '-') + "</td>" +
            "<td " + speedTStyle + ">" + deltaDist + "</td>" +
            "<td>" + roundTo(r.curr.deltaT, 0) + "</td>" +
            "<td " + getBG(r.curr.tsEndOfSailChange) + ">" + sailChange + "</td>" +
            "<td " + getBG(r.curr.tsEndOfGybe) + ">" + gybing + "</td>" +
            "<td " + getBG(r.curr.tsEndOfTack) + ">" + tacking + "</td>" +
            "</tr>";
    }

    function saveMessage(r) {
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
        if (document.getElementById("tab-content4").style.display == "block") initmap();
    }

    function getRaceLegId(id) {
        // work around for certain messages (Game_GetOpponents)
        if (id.raceId) {
            return id.raceId + '.' + id.legNum;
        } else {
            return id.race_id + '.' + id.leg_num;
        }
    }

    function legId(legInfo) {
        return legInfo.raceId + '.' + legInfo.legNum;
    }

    function clearLog() {
        divRawLog.innerHTML = "";
    }

    function tableClick(ev) {
        var call_rt = false;
        var call_wi = false;
        var call_pl = false;
        var friend = false;
        var tabsel = false;
        var dosort = true;
        var rmatch;
        var re_rtsp = new RegExp("^rt:(.+)"); // Call-Router
        var re_polr = new RegExp("^pl:(.+)"); // Call-Polars
        var re_wisp = new RegExp("^wi:(.+)"); // Weather-Info
        var re_rsel = new RegExp("^rs:(.+)"); // Race-Selection
        var re_usel = new RegExp("^ui:(.+)"); // User-Selection
        var re_tsel = new RegExp("^ts:(.+)"); // Tab-Selection

        switch (ev.target.id) {
            case "th_name":
                sortField = "displayName";
                break;
            case "th_rank":
                sortField = "rank";
                break;
            case "th_dtf":
                sortField = "distanceToEnd";
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

            case "th_rt":
            case "th_lu":
            case "th_brg":
            case "th_sail":
            case "th_psn":
                sortField = "none";
                break;
            default:
                dosort = false;
                break;
        }

        // Sort friends table
        if (dosort) {
            if (sortField == currentSortField) {
                currentSortOrder = 1 - currentSortOrder;
            } else {
                currentSortField = sortField;
                currentSortOrder = 0;
            }
            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
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
            }
        }
        if (rmatch) {
            if (tabsel) {
                // Tab-Selection
                for (var t = 1; t <= 4; t++) {
                    document.getElementById("tab-content" + t).style.display = (rmatch == t ? 'block' : 'none');
                }
                if (rmatch == 4) {
                    initmap(); // initialize google maps
                }
            } else if (friend) {
                // Friend-Routing 
                if (call_rt) callRouter(selRace.value, rmatch);
            } else {
                // Race-Switching
                if (call_wi) callWindy(rmatch, 0); // weather
                if (call_rt) callRouter(rmatch);
                if (call_pl) callPolars(rmatch);
                enableRace(rmatch, true);
                changeRace(rmatch);
            }
        }
    }

    function resize(ev) {
        for (var t = 1; t <= 4; t++) {
            var tab = document.getElementById("tab-content" + t);
            tab.style.height = window.innerHeight - tab.getBoundingClientRect().y;
        }
    }

    function enableRace(id, force) {
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
        var race = {
            id: raceId,
            name: "Race #" + raceId,
            source: "tmp"
        };
        initRace(race, false);
        return race;
    }

    function updatePosition(message, r) {
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
        r.curr.speedT = theoreticalSpeed(message);
        if (r.prev != undefined) {
            var d = gcDistance(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon);
            var delta = courseAngle(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon);
            var alpha = Math.PI - angle(toRad(r.prev.heading), delta);
            var beta = Math.PI - angle(toRad(r.curr.heading), delta);
            var gamma = angle(toRad(r.curr.heading), toRad(r.prev.heading));
            // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
            r.curr.deltaT = (r.curr.lastCalcDate - r.prev.lastCalcDate) / 1000;
            if (r.curr.deltaT > 0 &&
                Math.abs(toDeg(gamma) - 180) > 1 &&
                toDeg(alpha) > 1 &&
                toDeg(beta) > 1) {
                r.curr.deltaD = d / Math.sin(gamma) * (Math.sin(beta) + Math.sin(alpha));
            } else {
                r.curr.deltaD = d;
            }
            r.curr.speedC = Math.abs(roundTo(r.curr.deltaD / r.curr.deltaT * 3600, 2));
            // deltaD_T = Delta distance computed from speedT is only displayed when it deviates
            if (r.curr.speedT) {
                r.curr.deltaD_T = r.curr.deltaD / r.curr.speedC * r.curr.speedT.speed;
            }
            saveMessage(r);
        }
        if (message.gateGroupCounters) {
            r.gatecnt = message.gateGroupCounters;
            updatemap(r, "cp");
        }
        divRaceStatus.innerHTML = makeRaceStatusHTML();
        updatemap(r, "me");
    }

    function angle(h0, h1) {
        return Math.abs(Math.PI - Math.abs(h1 - h0));
    }

    function theoreticalSpeed(message) {
        var shortNames = {
            "JIB": "Jib",
            "SPI": "Spi",
            "STAYSAIL": "Stay",
            "LIGHT_JIB": "LJ",
            "CODE_0": "C0",
            "HEAVY_GNK": "HG",
            "LIGHT_GNK": "LG"
        }

        var boatPolars = polars[message.boat.polar_id];
        if (boatPolars == undefined || message.options == undefined || message.tws == undefined) {
            return undefined;
        } else {
            var tws = message.tws;
            var twd = message.twd;
            var twa = message.twa;
            var options = message.options;
            var foil = foilingFactor(options, tws, twa, boatPolars.foil);
            var foiling = (foil - 1.0) * 100 / (boatPolars.foil.speedRatio - 1.0);
            var hull = options.includes("hull") ? 1.003 : 1.0;
            var ratio = boatPolars.globalSpeedRatio;
            var twsLookup = fractionStep(tws, boatPolars.tws);
            var twaLookup = fractionStep(twa, boatPolars.twa);
            var speed = maxSpeed(options, twsLookup, twaLookup, boatPolars.sail);
            return {
                "speed": roundTo(speed.speed * foil * hull * ratio, 2),
                "sail": shortNames[speed.sail],
                "foiling": foiling
            };
        }
    }

    function maxSpeed(options, iS, iA, sailDefs) {
        var maxSpeed = 0;
        var maxSail = "";
        for (const sailDef of sailDefs) {
            if (sailDef.name === "JIB" ||
                sailDef.name === "SPI" ||
                (sailDef.name === "STAYSAIL" && options.includes("heavy")) ||
                (sailDef.name === "LIGHT_JIB" && options.includes("light")) ||
                (sailDef.name === "CODE_0" && options.includes("reach")) ||
                (sailDef.name === "HEAVY_GNK" && options.includes("heavy")) ||
                (sailDef.name === "LIGHT_GNK" && options.includes("light"))) {
                var speed = pSpeed(iA, iS, sailDef.speed);
                if (speed > maxSpeed) {
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

    function getSailDef(sailDefs, name) {
        for (const sailDef of sailDefs) {
            if (sailDef.name === name) {
                return sailDef;
            }
        }
        return null;
    }

    function pSpeed(iA, iS, speeds) {
        return bilinear(iA.fraction, iS.fraction,
            speeds[iA.index - 1][iS.index - 1],
            speeds[iA.index][iS.index - 1],
            speeds[iA.index - 1][iS.index],
            speeds[iA.index][iS.index]);
    }

    function bilinear(x, y, f00, f10, f01, f11) {
        return f00 * (1 - x) * (1 - y) +
            f10 * x * (1 - y) +
            f01 * (1 - x) * y +
            f11 * x * y;
    }

    function foilingFactor(options, tws, twa, foil) {
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

    function fractionStep(value, steps) {
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

    function callRouterZezo(raceId, userId, beta) {
        var optionBits = {
            "foil": 16,
            "winch": 4,
            "reach": 64,
            "heavy": 128,
            "light": 32
        };

        var baseURL = 'http://zezo.org';
        var r = races.get(raceId);
        var uinfo;

        if (userId) {
            uinfo = racefriends.get(raceId).uinfo[userId];
            if (uinfo === undefined) {
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
            var urlBeta = r.url + (beta ? "b" : "");
            var pos = r.curr.pos;
            var twa = r.curr.twa;
            var uid = r.curr._id.user_id;
            var type = "me";

            if (uinfo) {
                pos = uinfo.pos;
                twa = uinfo.twa;
                uid = userId;
                options = 0;
                type = "friend";
            }
            var url = baseURL + '/' + urlBeta + '/chart.pl?lat=' + pos.lat + '&lon=' + pos.lon +
                '&options=' + options + '&twa=' + twa + '&userid=' + uid + '&type=' + type;
            window.open(url, cbReuseTab.checked ? urlBeta : '_blank');
        }
    }

    function callWindy(raceId, userId) {
        var baseURL = 'https://www.windy.com';
        var r = races.get(raceId);
        var uinfo;

        if (userId) {
            uinfo = racefriends.get(raceId).uinfo[userId];
            if (uinfo === undefined) {
                alert("Can't find record for user id " + userId);
                return;
            }
        }
        var pos = r.curr.pos;
        if (uinfo) pos = uinfo.pos;
        var url = baseURL + '/overlays?gfs,' + pos.lat + ',' + pos.lon + ',6,i:pressure';
        var tinfo = 'windy:' + r.url;
        window.open(url, cbReuseTab.checked ? tinfo : '_blank');
    }

    function callPolars(raceId) {
        var baseURL = "http://toxcct.free.fr/polars/?race_id=" + raceId;
        var race = races.get(raceId);

        var twa = Math.abs(roundTo(race.curr.twa || 20, 1));
        var tws = roundTo(race.curr.tws || 4, 1);

        if (!race.curr.tws || !race.curr.twa) {
            alert("Missing TWA and/or TWS, calling polars with TWA=" + twa + "°, TWS=" + tws + "kn");
        }

        var url = baseURL + "&tws=" + tws + "&twa=" + twa;

        for (option in race.curr.options) {
            url += "&" + race.curr.options[option] + "=true";
        }

        url += "&utm_source=VRDashboard";

        window.open(url, cbReuseTab.checked ? baseURL : '_blank');
    }

    // Greate circle distance
    function gcDistance(lat0, lon0, lat1, lon1) {
        // e = r · arccos(sin(φA) · sin(φB) + cos(φA) · cos(φB) · cos(λB – λA))
        var rlat0 = toRad(lat0);
        var rlat1 = toRad(lat1);
        var rlon0 = toRad(lon0);
        var rlon1 = toRad(lon1);
        return radius * gcAngle(rlat0, rlon0, rlat1, rlon1);
    }

    function gcAngle(rlat0, rlon0, rlat1, rlon1) {
        return Math.acos(Math.sin(rlat0) * Math.sin(rlat1) +
            Math.cos(rlat0) * Math.cos(rlat1) * Math.cos(rlon1 - rlon0));

    }

    function courseAngle(lat0, lon0, lat1, lon1) {
        var rlat0 = toRad(lat0);
        var rlat1 = toRad(lat1);
        var rlon0 = toRad(lon0);
        var rlon1 = toRad(lon1);
        var xi = gcAngle(rlat0, rlon0, rlat1, rlon1);
        var a = Math.acos((Math.sin(rlat1) - Math.sin(rlat0) * Math.cos(xi)) /
            (Math.cos(rlat0) * Math.sin(xi)));
        return (Math.sin(rlon1 - rlon0) > 0) ? a : (2 * Math.PI - a);
    }

    function toRad(angle) {
        return angle / 180 * Math.PI;
    }

    function toDeg(angle) {
        return angle / Math.PI * 180;
    }

    function toDMS(number) {
        var u = sign(number);
        number = Math.abs(number);
        var g = Math.floor(number);
        var frac = number - g;
        var m = Math.floor(frac * 60);
        frac = frac - m / 60;
        var s = Math.floor(frac * 3600);
        var cs = roundTo(360000 * (frac - s / 3600), 0);
        while (cs >= 100) {
            cs = cs - 100;
            s = s + 1;
        }
        return {
            "u": u,
            "g": g,
            "m": m,
            "s": s,
            "cs": cs
        };
    }

    function roundTo(number, digits) {
        if (number !== undefined && !isNaN(number)) {
            var scale = Math.pow(10, digits);
            return Math.round(number * scale) / scale;
        } else {
            return '-';
        }
    }

    function sign(x) {
        return (x < 0) ? -1 : 1;
    }

    function pad0(val) {
        if (val < 10) {
            val = "0" + val;
        }
        return val;
    }

    function formatPosition(lat, lon) {
        var latDMS = toDMS(lat);
        var lonDMS = toDMS(lon);
        var latString = latDMS.g + "°" + pad0(latDMS.m) + "'" + pad0(latDMS.s) + '"';
        var lonString = lonDMS.g + "°" + pad0(lonDMS.m) + "'" + pad0(lonDMS.s) + '"';
        return latString + ((latDMS.u == 1) ? 'N' : 'S') + ' ' + lonString + ((lonDMS.u == 1) ? 'E' : 'W');
    }

    function initmap() {
        var race;
        race = races.get(selRace.value);

        var divMap = race.gdiv;
        var map = race.gmap;

        if (!race.gdiv) { // no div yet
            divMap = race.gdiv = document.createElement("div");
            divMap.style.height = "100%";
            divMap.style.display = "none";
            document.getElementById("tab-content4").appendChild(divMap);
        }

        races.forEach(function (race) {
            if (race.gdiv) race.gdiv.style.display = 'none';
        });
        divMap.style.display = 'block';

        // resize first
        controller.resize(undefined);

        if (map) {
            google.maps.event.trigger(map, 'resize');
            return;
        }

        if (!race.legdata) return; // no legdata yet;

        var bounds = race.gbounds = new google.maps.LatLngBounds();
        var mapOptions = {
            mapTypeId: 'terrain'
        };
        race.gmap = map = new google.maps.Map(divMap, mapOptions);
        map.setTilt(45);

        // start, finish
        var pos = new google.maps.LatLng(race.legdata.start.lat, race.legdata.start.lon);
        addmarker(map, bounds, pos, undefined, {
            color: "blue",
            text: "S"
        }, 'Start: ' + race.legdata.start.name, 'S', 10, 1);
        pos = new google.maps.LatLng(race.legdata.end.lat, race.legdata.end.lon);
        addmarker(map, bounds, pos, undefined, {
            color: "yellow",
            text: "F"
        }, 'Finish: ' + race.legdata.end.name, 'F', 10, 1);
        var fincircle = new google.maps.Circle({
            strokeColor: '#F00',
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
                repeat: '50px'
            }],
            geodesic: true,
            strokeColor: '#FFF',
            strokeOpacity: 0.5,
            strokeWeight: 1,
            zIndex: 4
        });
        ccpath.setMap(map);


        updatemap(race, "cp");
        updatemap(race, "fleet");
        updatemap(race, "me");
        map.fitBounds(bounds);
    }

    function updatemap(race, mode) {
        var map = race.gmap;
        var bounds = race.gbounds;

        if (!map) return; // no map yet


        // checkpoints
        if (mode == "cp") {
            if (!race.legdata) return;
            if (map._db_cp)
                for (var i = 0; i < map._db_cp.length; i++) map._db_cp[i].setMap(null);
            map._db_cp = new Array();
            for (var i = 0; i < race.legdata.checkpoints.length; i++) {
                var cp = race.legdata.checkpoints[i];
                var cp_name = "invsible";
                if (cp.display != "none") cp_name = cp.display;
                var position_s = new google.maps.LatLng(cp.start.lat, cp.start.lon);
                var position_e = new google.maps.LatLng(cp.end.lat, cp.end.lon);
                //var label_g = 'index: ' + i + ', id: ' + cp.id + ', group: ' + cp.group + ', type: ' + cp_name + ', engine: ' + cp.engine + ', side: ' + cp.side + ', name: ' + cp.name;
                var c_sb = "#0F0";
                var c_bb = "#F00";
                var zi = 8;
                var op = 1.0;
                var g_passed = false;
                if (race.gatecnt[cp.group - 1]) {
                    g_passed = true;
                    op = 0.3;
                } // mark/gate passed - semi transparent
                var label_g = cp.id + ', group: ' + cp.group + ', type: ' + cp_name + ', engine: ' + cp.engine + ', side: ' + cp.side + ', name: ' + cp.name + (g_passed ? ", PASSED" : "");
                var label_s = 'checkpoint ' + label_g;
                var label_e = 'checkpoint ' + label_g;

                if (cp.display == "none") {
                    c_sb = "#480";
                    c_bb = "#840";
                    zi = 6;
                }
                if (cp.side == "stbd") {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_sb, "C"), undefined, label_s, i, zi, op));
                    map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol(c_bb, "C"), undefined, label_e, i, zi, op));
                } else {
                    map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_bb, "C"), undefined, label_s, i, zi, op));
                    map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol(c_sb, "C"), undefined, label_e, i, zi, op));
                }
                if (cp.display == "gate") {
                    if (cp.side == "stbd") {
                        map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol('#FF0', "RR"), undefined, label_s, i, 8, op));
                        map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol('#FF0', "RL"), undefined, label_e, i, 8, op));
                    } else {
                        map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol('#FF0', "RL"), undefined, label_s, i, 8, op));
                        map._db_cp.push(addmarker(map, bounds, position_e, pinSymbol('#FF0', "RR"), undefined, label_e, i, 8, op));
                    }
                } else {
                    if (cp.side == "port") map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_bb, "RL"), undefined, label_s, i, 8, op));
                    if (cp.side == "stbd") map._db_cp.push(addmarker(map, bounds, position_s, pinSymbol(c_sb, "RR"), undefined, label_e, i, 8, op));
                }
                var path = [];
                path.push(position_s);
                path.push(position_e);
                var ppath = new google.maps.Polyline({
                    path: path,
                    strokeOpacity: 0.0,
                    icons: [{
                        icon: pinSymbol(cp.display == 'none' ? '#FF6600' : '#FFFF00', "DL", op),
                        repeat: '16px'
                    }],
                    geodesic: true,
                    //strokeColor: cp.display == 'none' ? '#FF6600' : '#FFFF00',
                    //strokeWeight: 0,
                    zIndex: cp.display == "none" ? 5 : 6
                });
                ppath.setMap(map);
                map._db_cp.push(ppath);
            }
        }

        // me
        if (mode == "me") {
            if (map._db_me)
                for (var i = 0; i < map._db_me.length; i++) map._db_me[i].setMap(null);
            map._db_me = new Array();

            // track
            var tpath = [];
            if (race.track) {
                for (var i = 0; i < race.track.length; i++) {
                    tpath.push(new google.maps.LatLng(race.track[i].lat, race.track[i].lon));
                }
                var ttpath = new google.maps.Polyline({
                    path: tpath,
                    geodesic: true,
                    strokeColor: '#4F4',
                    strokeOpacity: 0.7,
                    strokeWeight: 1,
                    zIndex: 4
                });
                ttpath.setMap(map);
                map._db_me.push(ttpath);
            }


            // boat
            pos = new google.maps.LatLng(race.curr.pos.lat, race.curr.pos.lon);
            map._db_me.push(addmarker(map, bounds, pos, pinSymbol('#4F4', "B", 0.7, race.curr.heading), undefined,
                'HDG:' + roundTo(race.curr.heading, 1) + ',SPD:' + roundTo(race.curr.speed, 2), 'me', 20, 0.7));
        }

        // opponents/followed
        if (mode == "fleet") {
            var rfd = racefriends.get(race.id);
            if (map._db_op)
                for (var i = 0; i < map._db_op.length; i++) map._db_op[i].setMap(null);
            map._db_op = new Array();

            Object.keys(rfd.uinfo).forEach(function (key) {
                var elem = rfd.uinfo[key];
                var bi = boatinfo(elem);
                var pos = new google.maps.LatLng(elem.pos.lat, elem.pos.lon);
                map._db_op.push(addmarker(map, bounds, pos, pinSymbol(bi.bcolor, "B", 0.7, elem.heading), undefined,
                    bi.name + '- HDG:' + bi.heading + ',SPD:' + bi.speed, 'U:' + key, 18, 0.7));
                // track
                var tpath = [];
                if (elem.track) {
                    for (var i = 0; i < elem.track.length; i++) {
                        tpath.push(new google.maps.LatLng(elem.track[i].lat, elem.track[i].lon));
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
            });
        }
    }

    function addmarker(map, bounds, pos, symbol, label, title, mref, zi, op) {
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

    function pinSymbol(color, objtyp, opacity, rotation) {
        if (!opacity) opacity = 1.0;
        if (!rotation) rotation = 0.0;
        return {
            path: ps_pathmap[objtyp][0],
            fillColor: color,
            fillOpacity: ps_pathmap[objtyp][2] ? 1.0 : 0.0,
            strokeColor: ps_pathmap[objtyp][2] ? '#000' : color,
            strokeWeight: 2,
            strokeOpacity: opacity,
            scale: ps_pathmap[objtyp][1],
            rotation: rotation
        };
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
        cbRouter.addEventListener("change", saveOption);
        cbReuseTab.addEventListener("change", saveOption);
        cbLocalTime.addEventListener("change", saveOption);
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
        cbRawLog = document.getElementById("cb_rawlog");
        divRawLog = document.getElementById("rawlog");
        initRaces();

        chrome.storage.local.get("polars", function (items) {
            if (items["polars"] !== undefined) {
                console.log("Retrieved " + items["polars"].filter(function (value) {
                    return value != null
                }).length + " polars.");
                polars = items["polars"];
            }
        });

        initialized = true;
    }

    var callRouter = function (raceId, userId, weather) {
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

        if (!races.get(raceId)) {
            alert('Unsupported race #' + raceId);
        } else if (races.get(raceId).curr === undefined) {
            alert('No position received yet. Please retry later.');
        } else if (races.get(raceId).url === undefined) {
            alert('Unsupported race, no router support yet.');
        } else {
            callRouterZezo(raceId, userId, beta);
        }
    }

    function reInitUI(newId) {
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
            });
            divRaceStatus.innerHTML = makeRaceStatusHTML();
            divRecordLog.innerHTML = makeTableHTML();
            divFriendList.innerHTML = makeFriendsHTML();
        };
    }


    var onEvent = function (debuggeeId, message, params) {
        if (tabId != debuggeeId.tabId)
            return;

        if (message == "Network.webSocketFrameSent") {
            // Append message to raw log
            if (cbRawLog.checked) {
                divRawLog.innerHTML = divRawLog.innerHTML + '\n' + '>>> ' + params.response.payloadData;
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

        } else if (message == "Network.webSocketFrameReceived") {
            // Append message to raw log
            if (cbRawLog.checked) {
                divRawLog.innerHTML = divRawLog.innerHTML + '\n' + '<<< ' + params.response.payloadData;
            }
            // Work around broken message
            var jsonString = params.response.payloadData.replace(/\bNaN\b|\bInfinity\b/g, "null");
            var response = JSON.parse(jsonString);
            if (response == undefined) {
                console.log("Invalid JSON in payload");
            } else {
                var responseClass = response["@class"];
                if (responseClass == ".AccountDetailsResponse") {
                    reInitUI(response.userId);
                    currentUserId = response.userId;
                    lbBoatname.innerHTML = response.displayName;
                } else if (responseClass == ".LogEventResponse") {
                    // Get the matching request and Dispatch on request type
                    var request = requests.get(response.requestId);

                    // Dispatch on request type                 
                    if (request == undefined) {
                        // Probably only when debugging.
                        // -- save and process later?
                        console.warn(responseClass + " " + response.requestId + " not found");
                    } else if ((request.eventKey == "LDB_GetLegRank" ||
                            request.eventKey == "LDB_GetGateRank") &&
                        response.scriptData.me !== null) {
                        // Use this response to update User/Boat info if the plugin is switched on while already logged in
                        reInitUI(response.scriptData.me._id);
                        currentUserId = response.scriptData.me._id;
                        lbBoatname.innerHTML = response.scriptData.me.displayName;
                        // Retrieve rank in current race
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        if (race != undefined) {
                            race.rank = response.scriptData.me.rank;
                            race.dtl = roundTo(response.scriptData.me.distance - response.scriptData.res[0].distance, 2);
                            divRaceStatus.innerHTML = makeRaceStatusHTML();
                        }
                    } else if (request.eventKey == "Leg_GetList") {
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
                    } else if (request.eventKey == "Game_GetBoatState") {
                        // First boat state message, only sent for the race the UI is displaying
                        var raceId = getRaceLegId(response.scriptData.boatState._id);
                        var race = races.get(raceId);
                        race.legdata = response.scriptData.leg;
                        // Don't try old race_id, messages will be misdirected
                        updatePosition(response.scriptData.boatState, race);
                        if (cbRouter.checked) {
                            callRouter(raceId);
                        }
                    } else if (request.eventKey == "Game_RefreshBoatState") {
                        // New message - does this replace the boatStatePush? 
                        var raceId = getRaceLegId(response.scriptData.boatState._id);
                        var race = races.get(raceId);
                        // Don't try old race_id, messages will be misdirected
                        updatePosition(response.scriptData.boatState, race);
                    } else if (request.eventKey == "Game_AddBoatAction") {
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
                        }
                    } else if (request.eventKey == "Meta_GetPolar") {
                        // Always overwrite cached data...
                        polars[response.scriptData.polar._id] = response.scriptData.polar;
                        chrome.storage.local.set({
                            "polars": polars
                        });
                        console.info("Stored new polars " + response.scriptData.polar.label);
                    } else if (request.eventKey == "Shop_GetCardsPack") {
                        var card = races.get(getRaceLegId(request)).curr.soloCard;
                        card.code = response.scriptData.packs[0].code;
                        card.ts = response.scriptData.tsSoloCard;
                        divRaceStatus.innerHTML = makeRaceStatusHTML();
                    } else if (request.eventKey == "Game_GetFollowedBoats") {
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        updateFriends(raceId, "followed", response.scriptData.res);
                        updatemap(race, "fleet");
                        if (raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    } else if (request.eventKey == "Game_GetOpponents") {
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        updateFriends(raceId, "opponents", response.scriptData.res);
                        updatemap(race, "fleet");
                        if (raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    } else if (request.eventKey == "Game_GetFleet") {
                        var raceId = getRaceLegId(request);
                        var race = races.get(raceId);
                        updateFriends(raceId, "fleet", response.scriptData.res);
                        updatemap(race, "fleet");
                        if (raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                    } else if (request.eventKey == "Game_GetBoatTrack") {
                        var raceId = getRaceLegId(request);
                        var rfd = racefriends.get(raceId);
                        var race = races.get(raceId);
                        var uid = request.user_id;
                        var ndata = rfd.uinfo[uid];

                        if (race) {
                            if (uid == race.curr._id.user_id) {
                                race.track = response.scriptData.track;
                                updatemap(race, "me");
                            } else if (ndata) {
                                ndata.track = response.scriptData.track;
                                updatemap(race, "fleet");
                            }
                        }
                    } else if (request.eventKey == "User_GetCard") {
                        var raceId = getRaceLegId(request);
                        var uid = request.user_id;
                        response.scriptData.legInfos.baseInfos = response.scriptData.baseInfos; // tweak record
                        updateFriendUinfo(raceId, "usercard", uid, response.scriptData.legInfos);
                        if (raceId == selRace.value) {
                            divFriendList.innerHTML = makeFriendsHTML(racefriends.get(selRace.value));
                        }
                        var race = races.get(raceId);
                        updatemap(race, "fleet");
                    }
                } else if (responseClass == ".ScriptMessage") {
                    // There is no request for .ScriptMessages.
                    // The only ScriptMessage type is extCode=boatStatePush
                    var raceId = getRaceLegId(response.data._id);
                    var race = races.get(raceId);
                    updatePosition(response.data, race);
                }
            }
        }
    }

    return {
        // The only point of initialize is to wait until the document is constructed.
        initialize: initialize,
        // Useful functions
        callRouter: callRouter,
        changeRace: changeRace,
        onEvent: onEvent,
        clearLog: clearLog,
        tableClick: tableClick,
        resize: resize,
        readOptions: readOptions,
        addConfigListeners: addConfigListeners
    }
}();


var tabId = parseInt(window.location.search.substring(1));


window.addEventListener("load", function () {

    controller.initialize();

    document.getElementById("bt_router").addEventListener("click", controller.callRouter);
    document.getElementById("sel_race").addEventListener("change", controller.changeRace);
    document.getElementById("bt_clear").addEventListener("click", controller.clearLog);
    document.addEventListener("click", controller.tableClick);
    document.addEventListener("resize", controller.resize);

    controller.readOptions();
    controller.addConfigListeners();

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
    chrome.debugger.onEvent.addListener(controller.onEvent);
});

window.addEventListener("unload", function () {
    chrome.debugger.detach({
        tabId: tabId
    });
});
