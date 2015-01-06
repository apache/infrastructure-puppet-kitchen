puppet-kitchen
==============

Test Kitchen + Puppet


Installation
------------

```
gem install bundler
bundle install
```

Usage
-----

Easiest way to get going:

```
kitchen converge default
```

This will bring up a vm, run puppet apply.

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanation isn't nearly as it needs to be).


Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
