import XCTest

@testable import LiveSession

private let start = 1_000_000.0
private let intervals = [
    LiveInterval(instruction: "Run for 1 minute", seconds: 60),
    LiveInterval(instruction: "Rest for 30 seconds", seconds: 30),
]

private func date(_ milliseconds: Double) -> Date { Date(timeIntervalSince1970: milliseconds / 1000) }

final class LiveSessionStateTests: XCTestCase {
    func testNamesTheIntervalUnderWayAndWhenItEnds() throws {
        let state = try XCTUnwrap(liveSessionState(intervals: intervals, startedAt: start, pauses: [], at: start + 70_000))

        XCTAssertEqual(state.instruction, "Rest for 30 seconds")
        XCTAssertEqual(state.intervalStart, date(start + 60_000))
        XCTAssertEqual(state.intervalEnd, date(start + 90_000))
        XCTAssertEqual(state.sessionStart, date(start))
        XCTAssertNil(state.pausedAt)
    }

    // An open interval has no end to count down to, so it counts up.
    func testGivesAnOpenIntervalNoEnd() throws {
        let open = [LiveInterval(instruction: "Run", seconds: nil)]
        let state = try XCTUnwrap(liveSessionState(intervals: open, startedAt: start, pauses: [], at: start + 3_600_000))

        XCTAssertEqual(state.instruction, "Run")
        XCTAssertNil(state.intervalEnd)
    }

    // A finished pause pushes every clock back by its length, so the time left
    // is the time the athlete still has to run.
    func testMovesTheClocksOnByAFinishedPause() throws {
        let pauses = [LivePause(startedAt: start + 10_000, endedAt: start + 25_000)]
        let state = try XCTUnwrap(liveSessionState(intervals: intervals, startedAt: start, pauses: pauses, at: start + 70_000))

        XCTAssertEqual(state.instruction, "Run for 1 minute")
        XCTAssertEqual(state.intervalEnd, date(start + 75_000))
        XCTAssertEqual(state.sessionStart, date(start + 15_000))
    }

    // Read where the hold began, so the state stands still for as long as the
    // pause lasts and the Lock Screen is not updated once a tick for nothing.
    func testHoldsStillThroughAPause() throws {
        let pauses = [LivePause(startedAt: start + 20_000, endedAt: nil)]
        let early = liveSessionState(intervals: intervals, startedAt: start, pauses: pauses, at: start + 30_000)
        let late = liveSessionState(intervals: intervals, startedAt: start, pauses: pauses, at: start + 300_000)

        XCTAssertEqual(early, late)
        XCTAssertEqual(late?.pausedAt, date(start + 20_000))
        XCTAssertEqual(late?.instruction, "Run for 1 minute")
    }

    func testHasNothingToShowOnceTheLastIntervalIsOver() {
        XCTAssertNil(liveSessionState(intervals: intervals, startedAt: start, pauses: [], at: start + 90_000))
    }
}

final class LivePaceTests: XCTestCase {
    func testMeasuresSecondsPerKilometre() {
        XCTAssertEqual(measuredPace(metres: 100, seconds: 30, floorMetres: 20), 300)
    }

    // A pace divided out of the first few metres is noise, and a dash is honest.
    func testHoldsBackUnderTheFloor() {
        XCTAssertNil(measuredPace(metres: 19, seconds: 5, floorMetres: 20))
        XCTAssertNil(measuredPace(metres: 0, seconds: 5, floorMetres: 0))
    }

    // As `paceIn` in `web/src/utils/exerciseMeasurements.ts` writes it.
    func testWritesAPaceInTheAthletesUnit() {
        XCTAssertEqual(paceLabel(secondsPerKilometre: 330, unit: "km"), "5:30 /km")
        XCTAssertEqual(paceLabel(secondsPerKilometre: 300, unit: "mi"), "8:03 /mi")
    }
}

final class WorthShowingTests: XCTestCase {
    private let shown = LiveSessionState(
        instruction: "Run", intervalStart: date(start), intervalEnd: date(start + 60_000),
        sessionStart: date(start), pausedAt: nil, pace: "5:30 /km")

    func testShowsTheFirstState() {
        XCTAssertTrue(worthShowing(shown, over: nil, secondsSince: 0))
    }

    func testShowsANewIntervalOrAPauseAtOnce() {
        var paused = shown
        paused.pausedAt = date(start + 1_000)
        XCTAssertTrue(worthShowing(paused, over: shown, secondsSince: 0.25))
    }

    // The pace moves with every fix, and the screen refreshes its own no
    // faster than every five seconds.
    func testHoldsAPaceChangeBackForAFewSeconds() {
        var faster = shown
        faster.pace = "5:20 /km"
        XCTAssertFalse(worthShowing(faster, over: shown, secondsSince: 4))
        XCTAssertTrue(worthShowing(faster, over: shown, secondsSince: 5))
    }

    // Shown again now and then even unchanged, which moves the stale date on.
    func testRenewsAnUnchangedStateBeforeItGoesStale() {
        XCTAssertFalse(worthShowing(shown, over: shown, secondsSince: 30))
        XCTAssertTrue(worthShowing(shown, over: shown, secondsSince: liveRenewSeconds))
        XCTAssertLessThan(liveRenewSeconds, liveStaleSeconds)
    }
}

final class LiveWorkoutStateTests: XCTestCase {
    func testCountsTheWorkoutUpFromItsStart() {
        let state = liveWorkoutState(exercise: "Squat", startedAt: start, restEndsAt: nil, restSeconds: nil,
                                     at: start + 600_000)

        XCTAssertEqual(state.exercise, "Squat")
        XCTAssertEqual(state.startedAt, date(start))
        XCTAssertNil(state.rest)
    }

    // The countdown runs from where the rest began, so its bar and its clock
    // both read the rest the athlete was given.
    func testCountsARestDownFromItsLength() throws {
        let rest = try XCTUnwrap(liveWorkoutState(exercise: "Squat", startedAt: start, restEndsAt: start + 700_000,
                                                  restSeconds: 90, at: start + 650_000).rest)

        XCTAssertEqual(rest.lowerBound, date(start + 610_000))
        XCTAssertEqual(rest.upperBound, date(start + 700_000))
    }

    // A rest that ran out while the app was away is over, not one at zero.
    func testLeavesOutARestAlreadyOver() {
        XCTAssertNil(liveWorkoutState(exercise: "Squat", startedAt: start, restEndsAt: start + 700_000,
                                      restSeconds: 90, at: start + 700_000).rest)
    }

    // A rest with no length recorded is read from now, never from before the
    // workout began.
    func testStartsARestOfUnknownLengthNow() {
        let state = liveWorkoutState(exercise: "Squat", startedAt: start, restEndsAt: start + 700_000,
                                     restSeconds: 0, at: start + 650_000)

        XCTAssertEqual(state.rest?.lowerBound, date(start + 650_000))
    }
}
