// Package username owns the names no athlete may answer to.
//
// Two kinds are refused. Anything carrying the brand, so that nobody can pass
// for the app itself — @getstronger is how a personal best would be announced,
// and a name a reader mistakes for it is the whole risk. And the words the web
// app has already spent on its own top-level routes, because a profile is
// linked to and typed as a bare name.
//
// The package knows nothing about who holds which name; whether a name is free
// is the store's judgement, and a caller asks both.
package username

import (
	"strings"
	"unicode"
)

// brand is refused anywhere in a name rather than only as the whole of one:
// @GetStrongerFan reads as official to anyone skimming a feed.
const brand = "getstronger"

// IsReserved reports whether a username is one nobody may register: it carries
// the brand, or it is a word the app has already spent.
func IsReserved(s string) bool {
	normalized := normalize(s)
	if strings.Contains(normalized, brand) {
		return true
	}

	for _, name := range exactMatches() {
		if normalize(name) == normalized {
			return true
		}
	}

	return false
}

// exactMatches are refused only when they are the whole username. The brand's
// short forms are here rather than matched as substrings because they are too
// short for that — @mikegs is nobody's impersonation — and the routes because
// a name is only a collision when it is the entire segment.
func exactMatches() []string {
	return append([]string{"gs", "gstronger"}, routeSegments()...)
}

// routeSegments is every static top-level path segment the web app routes. A
// name equal to one of these collides with a URL the router already owns.
//
// The list is kept by hand and guarded by TestRouteSegmentsCoverRouter, which
// reads the route table and fails when a route is added without being added
// here.
func routeSegments() []string {
	return []string{
		"exercises",
		"forgot-password",
		"home",
		"login",
		"logout",
		"notifications",
		"plans",
		"privacy",
		"profile",
		"progress",
		"reset-password",
		"routines",
		"settings",
		"signup",
		"users",
		"verify-email",
		"workout",
		"workouts",
	}
}

// normalize folds a name to the form reservations are judged by. Case and the
// separators '.', '_' and '-' are decoration, and dropping them is what stops
// @my_get_stronger_journey and @xX.get.stronger.Xx from walking past the
// brand: two names differing only in those are one claim on one word.
func normalize(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '.' || r == '_' || r == '-' {
			return -1
		}

		return unicode.ToLower(r)
	}, strings.TrimSpace(s))
}
