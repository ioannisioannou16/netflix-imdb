// ==UserScript==
// @name         Netflix IMDB Ratings
// @version      1.8
// @description  Show IMDB ratings on Netflix
// @author       Ioannis Ioannou
// @match        https://www.netflix.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_openInTab
// @connect      imdb.com
// @resource     customCSS  https://raw.githubusercontent.com/ioannisioannou16/netflix-imdb/master/netflix-imdb.css
// @resource     imdbIcon   https://raw.githubusercontent.com/ioannisioannou16/netflix-imdb/master/imdb-icon.png
// @updateURL    https://github.com/ioannisioannou16/netflix-imdb/raw/master/netflix-imdb.user.js
// @downloadURL  https://github.com/ioannisioannou16/netflix-imdb/raw/master/netflix-imdb.user.js
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
                cb(null, { score: score.textContent, votes: votes.textContent, url: titleUrl });
            });
        });
    }

    var cache = (function() {

        var cacheKey = "netflix-cache";

        var oneDayMs = 86400000;

        function getRandom(start, end) {
            return Math.ceil(Math.random() * (end - start) + start);
        }

        function mergeWithOtherCache(otherCache) {
            Object.keys(otherCache).forEach(function(otherKey) {
                var thisValue = _cache[otherKey];
                var otherValue = otherCache[otherKey];
                if (!thisValue || otherValue.expiration > thisValue.expiration) {
                    _cache[otherKey] = otherValue;
                }
            });
        }

        var listener = GM_addValueChangeListener(cacheKey, function(name, oldV, newV, remote) {
            if (remote) {
                mergeWithOtherCache(JSON.parse(newV));
            }
        });

        var _cache = JSON.parse(GM_getValue(cacheKey) || "{}");

        function isValid(res) {
            return res && (res.expiration - (new Date()).getTime() > 0);
        }

        function get(key) {
            var res = _cache[key];
            if (isValid(res)) return res.value;
        }

        function set(key, value) {
            var valueObj = { value: value, expiration: (new Date()).getTime() + getRandom(oneDayMs, 7 * oneDayMs) };
            _cache[key] = valueObj;
        }

        function removeInvalidEntries() {
            Object.keys(_cache).forEach(function(key) {
                if(!isValid(_cache[key])) {
                    delete _cache[key];
                }
            });
        }

        window.addEventListener("blur", function() {
            removeInvalidEntries();
            GM_setValue(cacheKey, JSON.stringify(_cache));
        });

        window.addEventListener("beforeunload", function () {
            removeInvalidEntries();
            GM_setValue(cacheKey, JSON.stringify(_cache));
            GM_removeValueChangeListener(listener);
        });

        return { get: get, set: set };
    })();

    function getRating(title, cb) {
        var cacheRes = cache.get(title);
        if (!cacheRes) {
            requestRating(title, function(err, rating) {
                if (err) {
                    cb(err);
                } else {
                    cache.set(title, rating);
                    cb(null, rating);
                }
            });
        } else {
            cb(null, cacheRes);
        }
    }

    var imdbIconURL = GM_getResourceURL("imdbIcon");

    function getOutputFormatter() {
        var div = document.createElement("div");
        div.classList.add("imdb-rating");
        div.style.cursor = "default";
        div.addEventListener("click", function() {});
        var img = document.createElement("img");
        img.classList.add("imdb-image");
        img.src = imdbIconURL;
        div.appendChild(img);
        div.appendChild(document.createElement("div"));
        return function(res) {
            var restDiv = document.createElement("div");
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
            } else if (rating && rating.score && rating.votes && rating.url) {
                var score = document.createElement("span");
                score.classList.add("imdb-score");
                score.appendChild(document.createTextNode(rating.score + "/10"));
                restDiv.appendChild(score);
                var votes = document.createElement("span");
                votes.classList.add("imdb-votes");
                votes.appendChild(document.createTextNode("(" + rating.votes + " votes)"));
                restDiv.appendChild(votes);
                div.addEventListener('click', function() {
                    GM_openInTab(rating.url, { active: true, insert: true, setParent: true });
                });
                div.style.cursor = "pointer";
            } else {
                var noRating = document.createElement("span");
                noRating.classList.add("imdb-no-rating");
                noRating.appendChild(document.createTextNode("N/A"));
                restDiv.appendChild(noRating);
            }
            div.replaceChild(restDiv, div.querySelector("div"));
            return div;
        }
    }

    function getRatingNode(title) {
        var node = document.createElement("div");
        var outputFormatter = getOutputFormatter();
        node.appendChild(outputFormatter({ loading: true }));
        getRating(title, function(err, rating) {
            if (err) return node.appendChild(outputFormatter({ error: true }));
            node.appendChild(outputFormatter({ rating: rating }));
        });
        return node;
    }

    function findAncestor (el, cls) {
        while(el && !el.classList.contains(cls)) {
            el = el.parentNode;
        }
        return el;
    }

    var rootElement = document.getElementById("appMountPoint");

    function imdbRenderingForCard(node) {
        var title = node.querySelector(".bob-title").textContent;
        var ratingNode = getRatingNode(title);
        ratingNode.classList.add("imdb-overlay");
        node.appendChild(ratingNode);
    }

    function imdbRenderingForOverview(node) {
        var jBone = findAncestor(node, "jawBone");
        var text = jBone.querySelector(".image-fallback-text");
        var logo = jBone.querySelector(".logo");
        var titleFromText = text ? text.textContent: null;
        var titleFromImage = logo ? logo.getAttribute("alt"): null;
        var title = titleFromText || titleFromImage;
        var ratingNode = getRatingNode(title);
        var meta = node.querySelector(".meta");
        meta.parentNode.insertBefore(ratingNode, meta.nextSibling);
    }

    function imdbRenderingForMoreLikeThis(node) {
        var title = node.querySelector(".video-artwork").getAttribute("alt");
        var meta = node.querySelector(".meta");
        var ratingNode = getRatingNode(title);
        meta.parentNode.insertBefore(ratingNode, meta.nextSibling);
    }

    function cacheTitleRanking(node) {
        var title = node.querySelector(".fallback-text").textContent;
        getRating(title, function() {});
    }

    var observerCallback = function(mutationsList) {
        mutationsList.forEach(function(mutation) {
            var newNodes = mutation.addedNodes;
            if (newNodes) {
                for (var newNode of newNodes) {
                    if (!(newNode instanceof HTMLElement)) continue;

                    if (newNode.classList.contains("bob-card")) {
                        imdbRenderingForCard(newNode);
                        break;
                    }

                    var meta = newNode.classList.contains("meta") ? newNode : null;
                    meta = meta || newNode.querySelector(".meta");
                    if (meta) {
                        var jawBonePane = findAncestor(meta, "jawBonePane");
                        if (jawBonePane && !jawBonePane.classList.contains("js-transition-node")) {
                            if (jawBonePane.id === "pane-Overview") {
                                imdbRenderingForOverview(jawBonePane);
                            } else if (jawBonePane.id === "pane-MoreLikeThis") {
                                var allSimsLockup = newNode.getElementsByClassName("simsLockup");
                                Array.prototype.forEach.call(allSimsLockup, function(node) { imdbRenderingForMoreLikeThis(node); });
                            }
                        }
                        break;
                    }

                    var titleCards = newNode.getElementsByClassName("title-card-container");
                    if (titleCards) {
                        Array.prototype.forEach.call(titleCards, function(node) { cacheTitleRanking(node); });
                        break;
                    }
                }
            }
        });
    };

    var observer = new MutationObserver(observerCallback);

    var observerConfig = { childList: true, subtree: true };

    observer.observe(document, observerConfig);

    var existingOverview = document.getElementById("pane-Overview");
    existingOverview && imdbRenderingForOverview(existingOverview);

    window.addEventListener("beforeunload", function () {
        observer.disconnect();
    });
})();
