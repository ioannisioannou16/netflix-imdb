// ==UserScript==
// @name         Netflix IMDB Ratings
// @version      1.0
// @description  Adds imdb ratings to Netflix
// @author       Ioannis Ioannou
// @match        https://www.netflix.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      imdb.com
// @resource     customCSS  https://raw.githubusercontent.com/ioannisioannou16/netflix-imdb/master/netflix-imdb.css
// @updateURL    https://github.com/ioannisioannou16/netflix-imdb/raw/master/netflix-imdb.user.js
// @downloadURL  https://github.com/ioannisioannou16/netflix-imdb/raw/master/netflix-imdb.user.js
// @require      https://raw.githubusercontent.com/uzairfarooq/arrive/master/minified/arrive.min.js
// ==/UserScript==

(function() {
    "use strict";
    
    GM_addStyle(GM_getResourceText("customCSS"));

    var domParser = new DOMParser();

    function GM_xmlhttpRequest_get(url, cb) {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function(x) { cb(null, x); },
            onerror: function() { cb("Request to " + url + " failed"); }
        });
    }

    function requestRating(title, cb) {
        var searchUrl = "https://www.imdb.com/find?s=tt&q=" + title;
        GM_xmlhttpRequest_get(searchUrl, function(err, searchRes) {
            if (err) return cb(err);
            var searchResParsed = domParser.parseFromString(searchRes.responseText, "text/html");
            var link = searchResParsed.querySelector(".result_text > a");
            var titleEndpoint = link && link.getAttribute("href");
            if (!titleEndpoint) return cb(null, {});
            var titleUrl = "https://www.imdb.com" + titleEndpoint;
            GM_xmlhttpRequest_get(titleUrl, function(err, titleRes) {
                if (err) return cb(err);
                var titleResParsed = domParser.parseFromString(titleRes.responseText, "text/html");
                var score = titleResParsed.querySelector("span[itemprop='ratingValue']");
                var votes = titleResParsed.querySelector("span[itemprop='ratingCount']");
                if (!score || (!score.textContent) || !votes || (!votes.textContent)) return cb(null, {});
                cb(null, { score: score.textContent, votes: votes.textContent });
            });
        });
    }

    var oneDayMs = 86400000;
    var oneWeekMs = 604800000;

    function getRandom(start, end) {
        return Math.ceil(Math.random() * (end - start) + start);
    }

    var cacheKey = "netflix-cache";

    var cache = JSON.parse(localStorage.getItem(cacheKey)) || {};

    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "hidden") {
            localStorage.setItem(cacheKey, JSON.stringify(cache));
        } else {
            setTimeout(function() { cache = JSON.parse(localStorage.getItem(cacheKey)); }, 100);
        };
    });

    window.addEventListener("beforeunload", function () {
        localStorage.setItem(cacheKey, JSON.stringify(cache));
    });

    function getRating(title, cb) {
        var cacheRes = cache[title];
        if (!cacheRes || (cacheRes.expiration - (new Date()).getTime() <= 0)) {
            requestRating(title, function(err, rating) {
                if (err && cacheRes) {
                    cb(null, cacheRes.rating);
                } else if (err) {
                    cb(err);
                } else {
                    cache[title] = { rating: rating, expiration: (new Date()).getTime() + getRandom(oneDayMs, oneWeekMs) };
                    cb(null, rating);
                }
            });
        } else {
            cb(null, cacheRes.rating);
        }
    }

    function getOutputFormatter() {
        var div = document.createElement("div");
        div.classList.add("imdb-rating");
        var img = document.createElement("img");
        img.classList.add("imdb-image");
        img.src = "https://raw.githubusercontent.com/ioannisioannou16/netflix-imdb/master/imdb-icon.png";
        div.appendChild(img);
        var restDiv = document.createElement("div");
        div.appendChild(restDiv);
        return function(res) {
            restDiv.innerHTML = "";
            var rating = res.rating;
            if (res.error) {
                var error = document.createElement("span");
                error.classList.add("imdb-error");
                error.appendChild(document.createTextNode("ERROR"));
                restDiv.appendChild(error);
            } else if (res.loading) {
                var loading = document.createElement("span");
                loading.classList.add("imdb-loading");
                loading.appendChild(document.createTextNode("fetching.."));
                restDiv.appendChild(loading);
            } else if (rating && rating.score && rating.votes) {
                var score = document.createElement("span");
                score.classList.add("imdb-score");
                score.appendChild(document.createTextNode(rating.score + "/10"));
                restDiv.appendChild(score);
                var votes = document.createElement("span");
                votes.classList.add("imdb-votes");
                votes.appendChild(document.createTextNode("(" + rating.votes + " votes)"));
                restDiv.appendChild(votes);
            } else {
                var noRating = document.createElement("span");
                noRating.classList.add("imdb-no-rating");
                noRating.appendChild(document.createTextNode("N/A"));
                restDiv.appendChild(noRating);
            }
            return div;
        }
    }

    function renderRating(title, node) {
        var outputFormatter = getOutputFormatter();
        node.appendChild(outputFormatter({ loading: true }));
        getRating(title, function(err, rating) {
            if (err) return node.appendChild(outputFormatter({ error: true }));
            node.appendChild(outputFormatter({ rating: rating }));
        });
    }

    function findAncestor (el, cls) {
        while(el && !el.classList.contains(cls)) {
            el = el.parentNode;
        }
        return el;
    }

    var rootElement = document.getElementById("appMountPoint");

    rootElement.arrive(".bob-overlay", function() {
        var title = this.querySelector(".bob-title").textContent;
        var div = document.createElement("div");
        div.classList.add("imdb-overlay");
        this.appendChild(div);
        renderRating(title, div);
    });

    rootElement.arrive(".overview", { existing: true }, function() {
        if (!this.classList.contains("imdb")) {
            this.classList.add("imdb");
            var meta = this.querySelector(".meta");
            var jBone = findAncestor(this, "jawBone");
            var text = jBone.querySelector(".image-fallback-text");
            var logo = jBone.querySelector(".logo");
            var titleFromText = text ? text.textContent: null;
            var titleFromImage = logo ? logo.getAttribute("alt"): null;
            var title = titleFromText || titleFromImage;
            var div = document.createElement("div");
            meta.parentNode.insertBefore(div, meta.nextSibling);
            renderRating(title, div);
        }
    });

    rootElement.arrive(".simsLockup", function() {
        if (!this.classList.contains("imdb")) {
            this.classList.add("imdb");
            var title = this.querySelector(".video-artwork").getAttribute("alt");
            var meta = this.querySelector(".meta");
            var div = document.createElement("div");
            meta.parentNode.insertBefore(div, meta.nextSibling);
            renderRating(title, div);
        }
    });

    rootElement.arrive(".title-card-container", function() {
        var title = this.querySelector(".fallback-text").textContent;
        getRating(title, function() {});
    });
})();
