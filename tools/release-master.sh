rm master.zip;
rm -rf sogeBot-master;
wget https://github.com/sogehige/sogeBot/archive/master.zip;
unzip master.zip;
cd sogeBot-master;
make;
make pack;
cp *.zip ../;
cd ../;
rm master.zip;
rm -rf sogeBot-master;