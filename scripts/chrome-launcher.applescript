-- Chrome for FastPilot: opens your normal Chrome, same profile and sign-ins, with the
-- "started debugging this browser" bar turned off (--silent-debugger-extension-api).
-- That flag hides the bar for every extension that uses Chrome's debugger, not just FastPilot.
-- Chrome reads flags only at startup, so an already-open Chrome has to restart once.
--
-- Other programs (Playwright, test runners) may run their own Chrome with a --user-data-dir of
-- their own. Those are left alone: only the Chrome on your own profile is restarted.
--
-- Build it with: npm run chrome-launcher

property flag : "--silent-debugger-extension-api"

-- Your own Chrome: the main Chrome process started without its own --user-data-dir.
on yourChromePid()
	return do shell script "ps -axo pid=,command= | awk '$2 == \"/Applications/Google\" && $3 == \"Chrome.app/Contents/MacOS/Google\" && $4 == \"Chrome\" && $0 !~ /--user-data-dir/ { print $1; exit }'"
end yourChromePid

on run
	set pid to yourChromePid()
	if pid is not "" then
		if (do shell script "ps -o command= -p " & pid) contains flag then
			display dialog "Chrome is already running with the debugging bar hidden." buttons {"OK"} default button "OK" with title "Chrome for FastPilot"
			return
		end if
		set reply to button returned of (display dialog "Chrome is open, so the debugging bar can't be hidden until it restarts. Restart Chrome now? Your tabs come back if Chrome is set to continue where you left off." buttons {"Not now", "Restart Chrome"} default button "Restart Chrome" with icon note with title "Chrome for FastPilot")
		if reply is "Not now" then return
		-- A normal quit: Chrome saves your session, as with Cmd-Q.
		do shell script "kill -TERM " & pid
		repeat 100 times
			if (do shell script "kill -0 " & pid & " 2>/dev/null && echo up || echo down") is "down" then exit repeat
			delay 0.1
		end repeat
		if (do shell script "kill -0 " & pid & " 2>/dev/null && echo up || echo down") is "up" then
			display dialog "Chrome didn't close (it may be asking about a page). Close it yourself, then open this again." buttons {"OK"} default button "OK" with icon caution with title "Chrome for FastPilot"
			return
		end if
	end if
	-- -n starts your Chrome even when another program's Chrome is running.
	do shell script "open -na 'Google Chrome' --args " & flag
end run
