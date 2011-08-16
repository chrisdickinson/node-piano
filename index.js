var burrito = require('burrito')
  , Module  = require('module').Module
  , path    = require('path')
  , read    = require('fs').readFileSync
  , vm      = require('vm')

var ExecutionContext = function() {
  this.functions = []
}

ExecutionContext.prototype.store = function(fn, start, end) {
  fn.__guid &&
  this.functions[fn.__guid] &&
    this.functions[fn.__guid].invoke(start, end)
}

var Tap = function(fn) {
  this.tapped_function  = fn
  this.stack            = (new Error).stack.split('\n')
  this.calls            = []
}

Tap.prototype.invoke = function(start, end) {
  this.calls.push({start:start, end:end})
}

var wrap_code = function(src) {
  return burrito(src, function(node) {
    switch(node.name) {
      case 'new':
        var fnsrc = node.source(),
            fn    = fnsrc.replace(/\(.*\)$/g, '').replace(/new\s*/g, '')

        if((/arguments/g)(fnsrc)) break;

        node.wrap('__call.call(this, '+fn+', function() { return %s; })')
      break;
      case 'call':
        var fnsrc = node.source(),
            fn    = fnsrc.replace(/(\.apply|\.call)?/g, '').replace(/\(.*\)/g, '')

        if((/arguments/g)(fnsrc)) break;
        // chained expressions need not apply.
        if(fnsrc.replace(/\(/g, '').length !== fnsrc.length-1)
          break;

        if(fn.length === 0)
          fn = 'IIFE'

        node.wrap('__call.call(this, '+fn+', function() { return %s; })')
      break;
      case 'function':
        var src = node.source();
        node.wrap('__decl(%s)')
      break;
      default:
      break;
    }
  })
}

var contribute_to_context = function(context, executionContext) {
  context.__call = function(fn, execution) {
    var start = +new Date,
        result

    try {
      return execution.call(this)
    } finally {
      // a quick primer on `finally`:
      // `return execution()` is called, but this is
      // called right after (but before returning to the calling scope!)
      //
      // even if the `execution` function raises an error,
      // we'll still get called -- and since we don't do anything about it
      // the exception will still travel up the stack as expected.
      executionContext.store(fn, start, +new Date)
    }
  }

  context.__decl = function(fn) {
    fn.__guid = executionContext.functions.push(new Tap(fn))
    return fn
  }

  return context
}

var node_environment = function(context, module, filename) {
    var req = function(path) {
      return Module._load(path, module);
    };
    req.resolve = function(request) {
      return Module._resolveFilename(request, module)[1];
    }
    req.paths = Module._paths;
    req.main = process.mainModule;
    req.extensions = Module._extensions;
    req.registerExtension = function() {
      throw new Error('require.registerExtension() removed. Use ' +
                      'require.extensions instead.');
    }
    require.cache = Module._cache;

    for(var k in global)
      context[k] = global[k];

    context.require = req;
    context.exports = module.exports;
    context.__filename = filename;
    context.__dirname = path.dirname(filename);
    context.process = process;
    context.console = console;
    context.module = module;
    context.global = context;

    return context;
};

module.exports = function() {
  var original_require  = require.extensions['.js']
    , execution_context = new ExecutionContext
    , context           = contribute_to_context({}, execution_context)

  require.extensions['.js'] = function(module, filename) {
    var module_context = {}
      , src            = wrap_code(read(filename, 'utf8'))
      , wrapper        = function(s) { 
        return 'return (function(ctxt) { return (function(__call, __decl) { return '+s+'; })(ctxt.__call, ctxt.__decl); })' 
      };

    node_environment(module_context, module, filename)

    var apply_execution_context = module._compile(wrapper(Module.wrap(src)), filename)
      , execute_module          = apply_execution_context(context)
      , args

    args = [
        module_context.exports
      , module_context.require
      , module
      , filename
      , module_context.__dirname
    ]

    return execute_module.apply(module.exports, args)
  }

  var complete = function(fn) {
    fn(execution_context.functions.slice())
  }
  complete.release = function() {
    require.extensions['.js'] = original_require
  }
  return complete
}

