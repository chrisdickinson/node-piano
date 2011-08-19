Piano
=====

A performance monitoring `require` hook for Node.js.

What does it do?
----------------

When you enable piano, all javascript processed by `require` will be processed by piano,
which will wrap all function declarations in a `__decl` call. Whenever a piano-wrapped function
is called, piano will record the length of time it took for that call to complete. 

When you're done, just ask piano for the results, and you can perform analytics on the collected data.

Example
-------

````javascript

var piano = require('piano')
  , ready = piano()

var plate   = require('plate')
  , tpl     = new plate.Template('{% for i in x %}{{ i }}{% endfor %}')
  , i       = 0
  , ctxt    = {x:[1,2,3,4,5,6,7,8,9,10]}
  , SAMPLES = 100
  tpl.render(ctxt, function(err, data) {
    if(i++ < SAMPLES)
      tpl.render(ctxt, arguments.callee)
    else {
      // let's look at some results!
      ready(function(items) {
        items
          .filter(function(tap) { return tap.calls.length > 0; })
          .map(function(tap) {
            console.error(
              "%s %s %s %s %s",
              tap.calls.length,
              tap.total()/1000+'ms',
              tap.avg()/1000+'ms',
              tap.filename.replace(process.cwd(), '.')+':'+tap.line,
              tap.source()
            )
        })
      })
    }
  })

````

API
===

````javascript
var piano = require('piano')
````

var ready = piano([pathFragment | regex])
-----------------------------------------

Hooks piano onto `require.extensions['.js']`. All files required after this point
will be parsed by piano if they match the path fragment (or regex). If no path or 
regex is provided, it will attempt to process *all* javascript files will be processed.

ready(function(taps, helpers) { })
----------------------------------

Call this function when you're finished running the code to be analyzed. It will call the provided callback
with a list of `Tap` objects representing all processed functions, as well as a `helpers` object, that contains
several 'sort' functions to help you sort your output.

Helpers include:

````

helpers.calls   // sort by number of calls
helpers.min     // sort by the minimum call time
helpers.max     // sort by the maximum call time
helpers.avg     // sort by the average call time
helpers.total   // sort by the total amount of time spent in a function

// usage:

var ready = piano();
ready(function(taps, helpers) {
    taps.
        sort(helpers.calls).
        forEach(function(tap) {
            console.log(tap.calls.length)
        })
})

````

ready.on('tap', function(tap, executionContext) {})
---------------------------------------------------

Emitted whenever a 'tapped' function is run -- that is, any function processed by piano.
It will be called with two arguments -- a `Tap` object that represents piano's bookkeeping
on the current function, and an `ExecutionContext` that represents all functions processed
by piano, as well as the current stack depth.

ready.release()
---------------

Restores the original `require.extensions['.js']` callback. 

ExecutionContext
----------------

An execution context may only be accessed through the `on('tap')` event, and has the following attributes:

````javascript
    ready.on('tap', function(tap, executionContext) {
        // a list of all `Tap`'d functions.
        executionContext.functions

        // a hash of all 'guids' for this context, with references to indices within `executionContext.functions`.
        executionContext.guids

        // an integer representing the current stack depth. not 100% guaranteed to be accurate.
        executionContext.stackDepth 
    })
````

Tap
----------------

A tap object contains all bookkeeping done for a function processed by piano. It is available via the `on('tap')` function,
as well as when calling `ready`. It has the following methods:

### Tap#min

Returns the quickest call to the tapped function as an integer representing microseconds.

### Tap#max

Returns the slowest call to the tapped function as an integer representing microseconds.

### Tap#avg

Return the average time taken by a function over all calls as a float representing microseconds.

### Tap#total

Return the total number of microseconds taken by a function over the duration of the test.

### Tap#source

Returns the original line of code that generated the tap as a string.

Tap also has the following properties:

### Tap.tapped_function

The original function object.

### Tap.calls

An array of `{start:integer, end:integer}` pairs, each representing a separate call to the function (and subsequent exit of the function).

### Tap.filename

The filename the Tap was generated from.

### Tap.line

The line number the Tap was generated from.

A Quick Note
============

Piano creates `Taps` keyed by the function content concatenated to the filename and line number that the function was seen at.

This means that Piano will not create multiple taps for inlined functions -- even though inlined functions strictly represent separate objects in V8. An example:

````javascript
    var fn = function() {
        // an inlined function:
        return function() {

        };
    };

    fn()()
    fn()()
````

Will create one `Tap` for `fn`, and one `Tap` for the function returned by fn. If, hypothetically, piano created `Taps` based
on whether the function was present in a list of functions, the previous code would have generated *3* taps -- one for `fn`, one for
the first time `fn()()` was called, and one for the second time `fn()()` was called. Since this isn't very useful behavior, I opted
to make Piano pay attention to the originating source of the function, not the function object itself.

LICENSE
=======

MIT.

