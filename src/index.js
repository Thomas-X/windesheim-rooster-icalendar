import util from 'util';
import {exec} from 'child_process';
import fs from 'fs';
import path from 'path';
import ical2json from 'ical2json';
import express from 'express';
import uuid from 'uuid/v1';
import axios from 'axios';

const app = express();
const executecmd = util.promisify(exec);


// TODO: add dynamic date as parameter on line 47

const _curl = async () => {
    const {stdout, stderr} = await executecmd(`curl 'https://roosters.windesheim.nl/WebUntis/Timetable.do?request.preventCache=1536270510278' -H 'Cookie: JSESSIONID=E41037D002E962BADB5483E9D09C03FE; schoolname="_V2luZGVzaGVpbQ=="' -H 'Origin: https://roosters.windesheim.nl' -H 'Accept-Encoding: gzip, deflate, br' -H 'Accept-Language: nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7,af;q=0.6' -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36' -H 'Content-Type: application/x-www-form-urlencoded' -H 'Accept: */*' -H 'Referer: https://roosters.windesheim.nl/WebUntis/?school=Windesheim' -H 'X-Requested-With: XMLHttpRequest' -H 'Connection: keep-alive' --data 'ajaxCommand=getWeeklyTimetable&elementType=1&elementId=2982&date=20180910&formatId=7&departmentId=0&filterId=-2' --compressed`);
    if (stdout) {
        return Promise.resolve(stdout)
    } else if (stderr) {
        return Promise.reject(stderr)
    }
};

app.get('/calendar', (req, res) => {
    _curl()
        .then(async (r) => {
            const {elementIds, elementPeriods, elementRoomLocks, elements} = JSON.parse(r).result.data;
            const studyCode = elementIds[0];
            const title_metadata = [];
            for (const lessonPeriod of elementPeriods[studyCode]) {
                for (const lesson of elements) {
                    for (const subElement of lessonPeriod.elements) {
                        if (subElement.id === lesson.id) {
                            title_metadata.push({
                                title: lesson.longName,
                                date: lessonPeriod.date,
                                startTime: lessonPeriod.startTime,
                                endTime: lessonPeriod.endTime,
                                name: lesson.name,
                            })
                        }
                    }
                }
            }

            const uri = "https://roosters.windesheim.nl/WebUntis/Ical.do?elemType=1&elemId=2982&rpt_sd=2018-09-10";

            const response = await axios({
                method: 'GET',
                url: uri,
                responseType: 'stream',
                headers: {
                    ['Upgrade-Insecure-Requests']: 1,
                    ['User-Agent']: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
                    ['X-DevTools-Emulate-Network-Conditions-Client-Id']: 'CBFD09C76CC6E9659861BC4A1FBEEBA4',
                    ['Accept']: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    ['Referer']: 'https://roosters.windesheim.nl/WebUntis/?school=Windesheim',
                    ['Accept-Encoding']: 'gzip, deflate, br',
                    ['Accept-Language']: 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7,af;q=0.6',
                    ['Cookie']: 'JSESSIONID=650DDBE8426D17064C2FE759C5A3B42E; schoolname="_V2luZGVzaGVpbQ=="'
                }
            })
            const calendar_directory = path.join(__dirname, '/ics/calendar.ics');
            const stream = response.data.pipe(fs.createWriteStream(calendar_directory));
            stream.on('finish', () => {
                let data = ical2json.convert((fs.readFileSync(calendar_directory)).toString('utf8'));
                for (let i = 0; i < data.VCALENDAR[0].VEVENT.length;i++) {
                    const val = data.VCALENDAR[0].VEVENT[i].SUMMARY;
                    const val_title_splitted = val.split(' ');
                    // first set to ID's
                    let teacher_name = val_title_splitted[val_title_splitted.length - 2];
                    let lesson_name = val_title_splitted[val_title_splitted.length - 1];
                    for (const metadata of title_metadata) {
                        // transform names to actual names
                        if (metadata.name === teacher_name) {
                            teacher_name = metadata.title.split(', ').reverse().join(' ')
                        }
                        if (metadata.name === lesson_name) {
                            lesson_name = metadata.title
                        }
                    }
                    data.VCALENDAR[0].VEVENT[i].SUMMARY = `${lesson_name} van ${teacher_name}`
                }
                data = ical2json.revert(data)
                fs.writeFileSync(calendar_directory, data);
                res.download(calendar_directory, 'calendar.ics')
            })
        })
        .catch(err => {
            console.error(err)
        })
});

app.listen(4000, () => console.log('Example app listening on port 4000!'))
