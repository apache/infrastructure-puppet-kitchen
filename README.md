puppet-kitchen
==============

Test Kitchen + Puppet

Requirements
------------

+ [Vagrant](https://www.vagrantup.com/)
+ Ruby 2.0 or later
+ [Virtualbox](https://www.virtualbox.org/)

Installation
------------

### Clone Repositories

```
git clone https://github.com/stumped2/puppet-kitchen
git clone https://github.com/apache/infrastructure-puppet
```

### Install required gems

```
gem install bundler
cd <path to infra puppet repo>
bundle install
```

### Get modules

```
cd <path to infra puppet repo>
./bin/pull # this will pull in all the 3rd party modules at the specified versions we use in production
```

### Make modules useable

```
cd <path to puppet-kitchen repo>
cd puppet/modules
export ipr=<path to infra-puppet repo>
for i in $(ls $ipr/3rdParty); do ln -s $ipr/3rdParty/$i ./; done
for i in $(ls $ipr/modules); do ln -s $ipr/modules/$i ./; done
```

Usage
-----

Make sure to have some puppet modules in the ``puppet/modules/`` directory.
The current hiera setup assumes you have the following modules:

+ [apache](https://github.com/puppetlabs/puppetlabs-apache) 
+ ASF's customfact
+ [concat](https://github.com/puppetlabs/puppetlabs-concat)
+ [stdlib](https://github.com/puppetlabs/puppetlabs-stdlib)
+ [apt](https://github.com/puppetlabs/puppetlabs-apt)

If using [GitHub](https://github.com/) to obtain modules, make sure when you clone the module, it only has the module name on the resulting folder.
Example:

```
git clone https://github.com/puppetlabs/puppetlabs-apt.git apt
```

Then edit ``puppet/data/node/default-ubuntu1464.yaml`` to start adding classes and setting class parameters.

When you're ready to test, just run:

```
kitchen converge default
```

This will bring up a vm, run puppet apply. From there, you can continue writing your puppet module (in ```puppet/modules/$module```) and testing by running the above command.

Most the the [test-kitchen](https://github.com/test-kitchen/test-kitchen#usage)
option work with puppet, however make sure to see
the [kitchen-puppet](https://github.com/neillturner/kitchen-puppet/blob/master/provisioner_options.md)
documentation (even though the explanations aren't nearly as detailed as it needs to be).


Most information has been taken from [here](http://ehaselwanter.com/en/blog/2014/05/08/using-test-kitchen-with-puppet/)
