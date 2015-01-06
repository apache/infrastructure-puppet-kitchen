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

Make sure to have some puppet modules in the ``puppet/modules/`` directory.
The current hiera setup assumes you have the [apache](https://github.com/puppetlabs/puppetlabs-apache) module, and ASF's customfact module.

Then edit ``puppet/data/node/default-ubuntu14.vagrantup.com.yaml`` to start adding classes and setting class parameters.

When you're ready to test, just run:

```
kitchen converge default
```

This will bring up a vm, run puppet apply. From there, you can continue writing your puppet module (in ```puppet/modules/$module```) and testing by running the above command.

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanation isn't nearly as it needs to be).


Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
