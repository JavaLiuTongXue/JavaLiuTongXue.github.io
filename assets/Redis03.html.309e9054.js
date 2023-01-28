import{_ as s,V as r,W as t,Y as e,Z as p,$ as i,a0 as d,x as c}from"./framework.3bd681ae.js";const n={},l=e("h1",{id:"redis集群架构所产生的问题及如何处理",tabindex:"-1"},[e("a",{class:"header-anchor",href:"#redis集群架构所产生的问题及如何处理","aria-hidden":"true"},"#"),p(" Redis集群架构所产生的问题及如何处理")],-1),f=e("p",null,"如果Redis是单节点部署的话，那如果Redis在那种高并发的环境下突然挂掉了，那基本上就玩完了，就算Redis对数据做了持久化，Redis重启之后要去恢复数据的话估计也要花费很久的时间，这样也极大的影响了项目的运行",-1),h=e("p",null,"因此在那种高并发的环境下，一般对于Redis的部署都是集群部署的，以此来保证高可用",-1),u=e("p",null,"Redis的高可用架构一共分为三种---主从、哨兵、Redis Cluster，它们虽然能够保证Redis的高可用，但是在使用的过程中还是会存在一定的问题",-1),o={href:"https://juejin.cn/post/7167731996620226567",target:"_blank",rel:"noopener noreferrer"},b=d('<h2 id="主从架构" tabindex="-1"><a class="header-anchor" href="#主从架构" aria-hidden="true">#</a> 主从架构</h2><p>主从架构在很多的中间件中也经常用到，比如 zookeeper 、Mysql , 一般来说主从架构在部署的时候都是一主多从，其中主节点主要对外提供服务，从节点不对外提供服务，主要是对主节点进行数据备份</p><p>对于主从架构示意图如下：</p><p><img src="https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/fe7ac18750a241dda5d44e4e495b69b7~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>这样，就算主节点挂掉了，我们也可以快速的切换到从节点，来保证项目的可以持续运行</p><h3 id="主从如何进行数据同步" tabindex="-1"><a class="header-anchor" href="#主从如何进行数据同步" aria-hidden="true">#</a> 主从如何进行数据同步</h3><p>主从数据同步分为增量同步和快照同步，增量同步就只同步主节点的部分数据，快照同步就是对主节点进行全量复制</p><h4 id="快照同步" tabindex="-1"><a class="header-anchor" href="#快照同步" aria-hidden="true">#</a> 快照同步</h4><p>如果为 Master 配置了一个 slave 节点，不管这个 slave 节点是否是第一次连接上 master ，都会发送一个 PSYNC 命令给 Master</p><p>Master 接收到 PSYNC 命令之后，在后台会通过 bgsave 将所有的数据生成一个最新的RDB快照文件，当把这个RDB快照文件生成完成之后就会把这个RDB快照文件发送给 Slave , Master 在发送期间照常对外提供服务</p><p>Slave接收到RDB快照文件之后，首先会对自己内存里的数据进行一次清空处理，再对RDB文件进行一次全量加载</p><p>刚才我又说过，Master在发送RDB文件的过程中仍然可以对外提供服务，在此期间如果接收到了修改数据的请求，那么Redis会把修改请求的命令保存到一个 buffer 中，等把RDB文件发送完了，再把 buffer 中的修改数据的命令再一次发送给 Savle 节点</p><p>对应的快照同步示意图如下：</p><p><img src="https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/a4fe474818664930a707162b3062e345~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><h4 id="增量同步" tabindex="-1"><a class="header-anchor" href="#增量同步" aria-hidden="true">#</a> 增量同步</h4><p>快照是将所有的内存数据打包发送给从节点，如果数据量过大那么在打包到发送完成需要占用很长的时间及消耗非常多的资源，Redis因此引入了增量同步</p><p>主节点会把写命令保存到buffer中，然后异步将 buffer 中的指令同步到从节点</p><p>Master 和它所有的 Slave 都维护了 buffer 的偏移量，因此 Savle 在执行 buffer 中指令过程中会通过偏移量向 Master 反馈自己同步到哪了</p><p>而这个 buffer 是有限的，因此Redis 主节点不能将所有的指令都记录在 buffer 中，我们可以把 buffer 比作是一个环形的数组，如下：</p><p><img src="https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7ba32f5cb4744297906ab2f695cc8d3a~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>当把这个环形数组写满之后，又会从头开始写，并且把之前写过的数据覆盖掉</p><p>如果因为网络状况不好， 从节点无法从 buffer 中同步数据，那么当网络恢复时，Redis的主节点中那些没有同步的指令在 buffer 中有可能被覆盖掉，是不是就会导致数据不一致呢</p><p>其实我在上面就说到了一个偏移量，Redis会判断这个偏移量在环形数据中是否存在，如果不存在就会直接通过全量同步的方式来同步主节点的数据，所以可以不用担心由于网络问题而导致数据不一致的问题</p><h3 id="主从架构所产生的问题" tabindex="-1"><a class="header-anchor" href="#主从架构所产生的问题" aria-hidden="true">#</a> 主从架构所产生的问题</h3><p>主从架构虽然能够保证Redis的高可用，但是也会存在问题</p><p><strong>问题一： 主节点宕机无法自动恢复</strong></p><p>这个问题是主从架构无法避免的问题，你一定会想，主节点宕机之后不是可以人工去恢复吗，为啥要需要它自动恢复呢</p><p>如果Redis是在白天突然宕机了，那人工恢复也没啥问题，但是如果是凌晨宕机呢，此时所有的开发包括运维人员都在睡觉，那项目就无法保证正常的运行了</p><p>这个问题会在后面的哨兵和Redis Cluster 集群机构中解决</p><p><strong>问题二：主从复制风暴</strong></p><p>所谓主从复制风暴，就是由于多个从节点同时从主节点上复制数据导致主节点压力过大，性能下降</p><p>我们在搭建主从集群的时候一般是一主两从或两从以上，如果从节点不是很多的话，比如我就只搭两个从节点，从节点从主节点复制数据的时候那还好，不会给主节点造成很大的压力</p><p>如果是有 100 个从节点同时从主节点上复制数据呢，那主节点压力会非常大</p><p>为了解决这种问题，我们可以不用搭建太多的从节点，一般就两个够了，如果公司真的有规定要搭建多个的话，那可以这样来搭建：</p><p><img src="https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/45becf9e1a7b454b93f045fa259d9cfa~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>既然主节点由于数据复制承担太多的压力而导致性能下降，那我们可以把主从数据同步的压力分摊给其他的从节点</p><h2 id="哨兵集群" tabindex="-1"><a class="header-anchor" href="#哨兵集群" aria-hidden="true">#</a> 哨兵集群</h2><p>主从架构无法解决主节点宕机无法自动恢复问题，因此Redis就引入了哨兵集群</p><p>哨兵是Redis提供的一个特殊服务，我们可以通过搭建哨兵集群来监控主从架构的主节点，当主节点宕机了，哨兵集群就会立马自动切换到其他的从节点上</p><p>哨兵集群示意图：</p><p><img src="https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4f1f059083934731b143f4dc2fa69ddf~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>在客户端访问的时候也不再直接访问主从架构的主节点，而是会直接访问哨兵集群，哨兵集群会把主从架构的主节点IP和端口返回给客户端，客户端再拿IP和端口去访问主节点</p><h3 id="如何解决主从架构宕机问题" tabindex="-1"><a class="header-anchor" href="#如何解决主从架构宕机问题" aria-hidden="true">#</a> 如何解决主从架构宕机问题</h3><p>当哨兵集群检测到主节点宕机时，哨兵集群的内部会通过一个选举机制来从主从架构的从节点中选举出一个从节点来当新的主节点</p><p>这也就是为什么哨兵集群为啥要用三个Redis实例搭建而不是两个，主要就是因为这个选举机制</p><h3 id="哨兵集群所产生的问题" tabindex="-1"><a class="header-anchor" href="#哨兵集群所产生的问题" aria-hidden="true">#</a> 哨兵集群所产生的问题</h3><p><strong>问题一：在选举的过程中无法继续对外提供服务</strong></p><p>虽然哨兵集群可以让主节点宕机恢复，但是在哨兵集群在内部选举期间，整个Redis主从架构是无法对外提供服务的，必须要选举出新的主节点才能继续对外提供服务</p><p>这就会造成项目在运行过程中业务受阻，性能下降，因此无法在高并发环境下承担较大的流量</p><p><strong>问题二：集群容量受限</strong></p><p>哨兵集群只能监控一个主从架构，在那些大型的互联网公司里一个主从架构的容量肯定是不够的</p><p>Redis Cluster集群就很好的解决以上的问题</p><h2 id="redis-cluster-集群" tabindex="-1"><a class="header-anchor" href="#redis-cluster-集群" aria-hidden="true">#</a> Redis Cluster 集群</h2><p>为了解决哨兵集群带来的问题，Redis在3.0版本就推出了Redis Cluster集群功能，Redis Cluster集群 是由多个主从节点群组成的分布式服务器群，它具有复制、高可用和分片特性，Redis集群不需要sentinel哨兵也能完成节点移除和故障转移的功能，因此这个Redis Cluster比哨兵集群具有更高的可用性和性能</p><p>Redis Cluster 集群示意图：</p><p><img src="https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/50212ec6e2c64fa1901a562ce18107fc~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>Redis Cluster 集群是由多个主从架构组成的一个大的集群，每个主从架构里的数据是不重叠的，我们也可以对Redis Cluster 进行水扩容(官方推荐不超过1000个节点)</p><p>Redis Cluster 集群在主节点宕机的时候，其他的节点也会通过选举机制来选举新增的主节点</p><h3 id="redis-cluster-集群如何对数据进行存取" tabindex="-1"><a class="header-anchor" href="#redis-cluster-集群如何对数据进行存取" aria-hidden="true">#</a> Redis Cluster 集群如何对数据进行存取</h3><p>Redis Cluster 集群在创建的时候会有一个哈希槽位分配机制，就是Redis会分配16384个逻辑槽位，那么在创建集群的时候，会把这16384个逻辑槽位划分为好几个连续的哈希槽，然后再把主节点与这个连续的哈希槽对应起来，这划分的槽位数据会被主节点保存起来</p><p>我们在搭建Redis Cluster集群的时候就可以看出</p><p><img src="https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3c9ba10e68894222bee149b196989248~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>以上的图片是我在单间Redis Cluster集群的时候输出的一些信息</p><p>这里注意，在分配哈希槽位的时候，只会给主从架构中的主节点分配</p><p>这些哈希槽位主要作用于对数据的存取</p><p>Redis Cluster 客户端在存取数据的时候会通过计算 key 的哈希值，然后根据这个哈希值定位到具体的哈希槽，再把这个我们需要设置的值存放到哈希槽所对应的节点中</p><p>这里Redis对key的哈希值的计算公式： HASH_SLOT = CRC16(key) % 16384</p><p>当我们用java的方式来操作集群的时候，Java客户端会将这些个槽位数据与节点的对应关系保存到本地，然后当我们使用API去设置值的时候，java客户端会计算出key的哈希值，再通过哈希值找到对应的主节点，然后再获取这个主节点的连接信息并将值设置到主节点里去</p><p>Java客户端会将槽位数据保存到本地，那如果Redis服务端槽位数据发生了改变， java客户端在设置值的时候发现这个槽位数据对应的主节点不存在，这时Redis服务端向java客户端发送一个特殊的跳转指令携带目标操作的节点地址，告诉客户端去连这个节点去操作数据，客户端收到指令后除了跳转到正确的节点上去操作，还会同步更新纠正本地的槽位映射表缓存，后续所有 key 将使用新的槽位映射表</p><h3 id="redis-cluster-集群选举原理" tabindex="-1"><a class="header-anchor" href="#redis-cluster-集群选举原理" aria-hidden="true">#</a> Redis Cluster 集群选举原理</h3><p>Redis Cluster 集群选举跟哨兵集群选举跟哨兵集群选举还是不太一样的</p><p>在主节点宕机了的时候，它的从节点会向其他的主从节点发出选举，其他的主从节点收到选举的消息之后，会立马向发起者响应(这里响应并不是所有的节点都会去响应，而是只有主节点才会响应)，当发起者收到的响应数过半的时候，发起者会将自己的改为主节点</p><p>具体步骤如下：</p><p>1.slave发现自己的master变为FAIL</p><p>2.将自己记录的集群currentEpoch加1，并广播FAILOVER_AUTH_REQUEST 信息</p><p>3.其他节点收到该信息，只有master响应，判断请求者的合法性，并发送FAILOVER_AUTH_ACK，对每一个epoch只发送一次ack</p><p>4.尝试failover的slave收集master返回的FAILOVER_AUTH_ACK</p><p>5.slave收到超过半数master的ack后变成新Master(这里解释了集群为什么至少需要三个主节点，如果只有两个，当其中一个挂了，只剩一个主节点是不能选举成功的)</p><p>6.slave广播Pong消息通知其他集群节点。</p><p>这里集群选举只需要做一下了解即可，在面试中一般也很少会问到</p><h3 id="redis-cluster-集群所产生的问题" tabindex="-1"><a class="header-anchor" href="#redis-cluster-集群所产生的问题" aria-hidden="true">#</a> Redis Cluster 集群所产生的问题</h3><p><strong>问题一：脑裂问题</strong></p><p>所谓脑裂问题，就是当主从集群里的主节点因为网络发生抖动，其他的节点误以为主节点宕机从而选举出一个新的主节点，这就造成了一个主从集群里有两个主节点</p><p>为了更好的说明脑裂问题，我来举个例子，假设我在生产上部署了 Redis Cluster 集群，Redis Cluster集群里有三个主从集群，这三个主从集群的主节点分别命令为 Master1、Master2、Master3，从节点分别命令为Slave1、Slave2、Slave3、Slave4、Slave5、Slave6，如下：</p><p><img src="https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/618b20759c0b4ab7b35ea7e1c5c94f88~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>其中 Master1 由于网络抖动，Slave1与Slave2误以为Master1宕机了，于是向其他的六个节点发出选举，其他的六个节点选举出 Slave1 作为当前主从集群的新的主节点，我们暂且命名为 Master4</p><p>于是 Master1 主从集群中就出现了两个主节点，如下：</p><p><img src="https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4301cbf5b81f4a8098c3f34b0e572025~tplv-k3u1fbpfcp-watermark.image?" alt="image.png"></p><p>这样看起来我想没啥问题，但是想一下，如果 Master1 网络恢复了，那么就会变成 Master4 的从节点，变成从节点之后就会开始从 Master4 中同步数据并把以前的数据覆盖掉，这样就造成了数据的丢失</p><p>对于这个问题我们有两种解决方案：</p><p>方案一 : 一般这种网络抖动就是那么一小会的事情，为了那么一小会的网络抖动而去引发选举，那就有点大可不必了，因此我们可以调长主从节点的通信超时时长，我们在Redis Cluster 集群搭建的时候会有一个项 cluster-node-timeout 配置，这个配置就表示当某个节点持续 timeout 的时间失联时，才可以认定该节点出现故障，需要进行主从切换。我们可以通过这个配置来配置超时时长，尽量减少由于网络抖动而引发的数据丢失</p><p>方案二：我们可以在 redis.conf 配置 min-replicas-to-write ，这个就是代表写数据成功最少同步的slave数量，这个数量可以模仿大于半数机制配置，比如集群总共三个节点可以配置1，加上leader就是2，超过了半数</p><p>这里需要注意下，这个配置在一定程度上会影响集群的可用性，比如slave要是少于1个，这个集群就算leader正常也不能提供服务了，需要具体场景权衡选择</p><p><strong>问题二：水平扩容比较麻烦</strong></p><p>对于新加入进来的主从集群，还需要手动的为其分配Hash槽位，并且在迁移过程中，还会把槽位对应的数据也迁移过去</p><p>如果Hash槽位分配不当的话，那么也会对数据存储不均匀</p><p>上面的几种架构都是基于主从架构的一个改进，具体在保证高可用的过程中要使用哪种架构还得需要做一个权衡</p>',97);function m(R,g){const a=c("ExternalLinkIcon");return r(),t("div",null,[l,f,h,u,e("p",null,[p("对于Redis集群如何进行搭建，可以看下这篇文章 ："),e("a",o,[p("Redis集群搭建"),i(a)])]),b])}const k=s(n,[["render",m],["__file","Redis03.html.vue"]]);export{k as default};
