import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import TextToSVG from "text-to-svg";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const app = express();
const tts = TextToSVG.loadSync("./fonts/sf.ttf");

initializeApp({
  apiKey: process.env.API_KEY,
  authDomain: process.env.AUTH_DOMAIN,
  databaseURL: process.env.DATABASE_URL,
  projectId: process.env.PROJECT_ID,
  storageBucket: process.env.STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGING_SENDER_ID,
  appId: process.env.APP_ID,
  measurementId: process.env.MEASUREMENT_ID,
});

const db = getFirestore();
const statsRef = doc(db, "github-languages-stats", "stats");

const getStats = async () => {
  const repos = await fetch(`https://api.github.com/users/anonymaew/repos`);
  const reposData = await repos.json();
  let languagesAll = {},
    bytesTotal = 0;
  await Promise.all(
    reposData.map(async (repo) => {
      const languages = await fetch(
        `https://api.github.com/repos/anonymaew/${repo.name}/languages`
      );
      const languagesData = await languages.json();
      for (const [key, value] of Object.entries(languagesData)) {
        if (!languagesAll[key]) languagesAll[key] = 0;
        languagesAll[key] += Number(value);
        bytesTotal += Number(value);
      }
    })
  );

  let languagesList = [];
  while (languagesList.length < 5 && Object.keys(languagesAll).length != 0) {
    let max = 0,
      key = "";
    for (const [key2, value] of Object.entries(languagesAll)) {
      if (value > max) {
        max = value;
        key = key2;
      }
    }
    languagesAll[key] = null;
    max = Number(((max * 100) / bytesTotal).toFixed(2));
    const colors = await fetch(
      "https://raw.githubusercontent.com/ozh/github-colors/master/colors.json"
    );
    const colorsData = await colors.json();
    languagesList.push({
      name: key,
      value: max,
      color: colorsData[key].color,
    });
  }
  let leftover = 0;
  if (Object.keys(languagesAll).length != 0) {
    for (const [key, value] of Object.entries(languagesAll)) {
      leftover += Number(value);
    }
  }
  languagesList.push({
    name: "Others",
    value: Number(((leftover * 100) / bytesTotal).toFixed(2)),
    color: "#808080",
  });
  return languagesList;
};

app.get("/github-languages-stats", async (req, res) => {
  const stats = await getDoc(statsRef);
  let statsData = stats.data();
  if (new Date().getTime() - statsData.timestamp > 60 * 60 * 1000) {
    const lists = await getStats();
    statsData = {
      timestamp: new Date().getTime(),
      languages: lists,
    };
    await setDoc(statsRef, statsData);
  }

  const cloneStats = JSON.parse(JSON.stringify(statsData));
  let allValue = 0;
  statsData.languages.forEach((element) => {
    element.value += 1;
    allValue += element.value;
  });
  statsData.languages.forEach((element) => {
    element.value = (element.value * 100) / allValue;
  });
  statsData.languages.sort((a, b) => b.value - a.value);

  const w = 1.6;
  let pathX = w / 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
    100 + w + ((statsData.languages.length - 1) * w) / 6
  } ${w + 25}">`;
  svg += `<circle cx="${pathX}" cy="${w / 2}" r="${w / 2}" fill="${
    statsData.languages[0].color
  }"/>`;
  for (const [i, lang] of statsData.languages.entries()) {
    svg += `<path d="M${pathX} ${w / 2} L${pathX + lang.value} ${
      w / 2
    }" stroke="${lang.color}" stroke-width="${w}"/>`;

    svg += `<circle cx="${i % 2 == 0 ? 10 : 55}" cy="${
      (Math.floor(i / 2) + 1) * 6 + 2
    }" r="${(w * 2) / 3}" fill="${lang.color}"/>`;

    const attributes = {
      fill: "#c9d1d9",
    };
    const options = {
      x: i % 2 == 0 ? 15 : 60,
      y: (Math.floor(i / 2) + 1) * 6 + 2,
      fontSize: w * 2,
      anchor: "middle",
      attributes: attributes,
    };

    svg += tts.getPath(
      lang.name + "    " + cloneStats.languages[i].value.toFixed(2) + "%",
      options
    );

    pathX += lang.value + w / 6;
  }
  svg += `<circle cx="${pathX - 0.2}" cy="${w / 2}" r="${w / 2}" fill="${
    statsData.languages[statsData.languages.length - 1].color
  }"/>`;
  svg += `</svg>`;
  res.set("Content-Type", "image/svg+xml;charset=utf-8");
  res.send(svg);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});

export default app;
