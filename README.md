puppet-kitchen
==============

Test Kitchen + Puppet

Requirements
------------

+ [Vagrant](https://www.vagrantup.com/)
+ Ruby + Ruby gems
+ [Virtualbox](https://www.virtualbox.org/)
+ [ASF's Puppet repo](https://github.com/apache/infrastructure-puppet/)



Installation
------------

### Clone ASF's Puppet Repo

```
git clone https://github.com/apache/infrastructure-puppet
```

### Install required gems

```
gem install bundler
bundle install
```

### Get modules

```
mkdir -p $puppet-kitchen-root/puppet/modules
cd puppet/modules
for i in $(ls <path to infra-pupet 3rdParty>); do ln -s <path to infra-puppet 3rdParty>/$i ./; done
for i in $(ls <path to infra-puppet modules>); do ln -s <path to infra-puppet modules>/$i ./; done
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

Then edit ``puppet/data/node/default-ubuntu14.yaml`` to start adding classes and setting class parameters.

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
