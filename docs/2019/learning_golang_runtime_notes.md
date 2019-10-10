#### interface
```golang
// src/runtime/runtime2.go
type iface struct {
type eface struct {
```
- 非空接口类型 `iface` 结构体包含：
  - `tab *itab`
  - `data unsafe.Pointer`
- 空接口类型（即 `interface{}` 类型） `eface` 结构体包含：
  - `_type *_type`
  - `data unsafe.Pointer`
- `itab` 结构体包含：
  - `hash uint32` 用于在接口和具体类型转换时判定类型是否相符
  - `_type *_type` 具体类型的信息
  - `fun [1]uintptr` 用作虚表，直接使用该字段的指针，用作一个变长数组
- 具体类型转为接口，`convT2I` 函数：分配具体类型大小的空间，将 `data` 字段指向空间，将具体类型拷贝到空间

#### slice
```golang
// src/runtime/slice.go
type slice struct {
```
- range 接收的是被 range 对象的按值传递，因此在一个对 slice 的 range 中对 slice 进行 append 不会造成无限循环
- 扩容，`growslice` 函数：
  - 如果新长度大于当前容量的两倍，就扩容至新长度
  - 否则如果当前容量小于 1024，就将容量翻倍
  - 否则，循环增加当前容量的 1/4 直到大于等于新长度

#### map
```golang
// src/runtime/map.go
type hmap struct {
```
- `hmap` 结构体包含：
  - `count int` 键值对的个数
  - `hash0 uint32` 求哈希值的随机种子
  - `B uint8` 桶的数量的以 2 为底的对数，桶的数量总是 2 的整次幂
  - `buckets unsafe.Pointer` 当前桶的指针，指向 malloc 出的连续多个桶的第一个
  - `oldbuckets unsafe.Pointer` 扩容之前的桶的指针
- 创建 map，`makemap` 函数：根据 `make` 函数传入的 hint 来创建初始的 2 的整次幂个桶。桶的结构为 `bmap`，但 `bmap` 真正的字段结构是在运行时创建的，而非代码中声明的结构，因为 key 有不同的类型，而 golang 没有泛型！这也是为什么 `buckets` 字段的类型为 `unsafe.Pointer` 而非 `*bmap`
- 逻辑上 `bmap` 结构体包含：
  - `topbits [8]uint8` 缓存每个 key 的哈希值的高 8 位
  - `keys [8]K`
  - `values [8]V` 可见每个桶最多存 8 个键值对
- range 遍历，`mapiterinit` 函数：生成一个随机数来决定从哪个桶开始遍历
- `m[k]` 式的读操作，`mapaccess1` 函数：计算 `uintptr` 类型的哈希值，通过哈希值的低 `hmap.B` 位确定访问哪个桶，通过哈希值的高 8 位与桶中的 `topbits` 逐一对比，相同时再进行 key 的对比
- 写操作，`mapassign` 函数：与 `m[k]` 式的读相似地通过哈希值查找，如果发现 key 不存在则写入到第一个空的点位。如果键值对数量与容量的比值大于 6.5 且未在扩容中则开始扩容
- 扩容，`hashGrow` 函数：将 `buckets` 赋给 `oldbuckets`，给 `buckets` 分配翻倍的桶数，原第 `i` 个桶的数据会迁移到新第 `i` 和 `i + len(oldbuckets)` 个桶。每个桶的数据迁移是在该桶涉及到写和删操作时进行的（`growWork` 函数）

#### func
- 与 C 语言使用寄存器不同，Golang 只使用栈进行函数参数和返回值的传递，这也是支持多值返回的原因。主调函数会将参数压进自己的栈帧，且在自己的栈帧上分配返回值的空间。

#### defer
```golang
// src/runtime/runtime2.go
type _defer struct {
```
- `_defer` 结构体包含：
  - `sp uintptr` 当前函数的栈指针
  - `pc uintptr` 当前函数的程序指针
  - `fn *funcval` 传给 defer 的函数
- defer 语句执行，`deferproc` 函数：设置以上字段，传递 defer 函数的参数，将 `_defer` 结构体置于当前协程的 
 `_defer` 结构体组成的链表的头部
- 编译时会插入代码，在当前函数返回时，遍历执行链表中所有栈指针与当前函数栈指针相同的 `_defer` 结构体中的函数（`deferreturn` 函数）

#### goroutine
```golang
// src/runtime/runtime2.go
type m struct {
type g struct {
type p struct {
```
- 操作系统线程 `m` 结构体包含：
  - `g0 *g` 拥有调度栈的调度协程
  - `curg *g` 当前运行的协程
  - `p uintptr` 绑定的调度器
- 协程 `g` 结构体包含：
  - `m *m` 绑定的线程
  - `sched gobuf` 寄存器等上下文
  - `atomicstatus uint32`
- 协程状态 `atomicstatus`：
  - `_Gidle` 未初始化
  - `_Gdead` 未运行，不在队列中
  - `_Grunnable` 未运行，在队列中等待调度
  - `_Grunning` 正运行在用户态，不在队列中
  - `_Gsyscall` 正运行在内核态，不在队列中
  - `_Gwaiting` 被阻塞，不在队列中
- 调度器 `p` 结构包含：
  - `m uintptr` 绑定的线程
  - `runq [256]uintptr` 待执行协程的队列，数组用作一个循环队列
  - `runnext uintptr` 下一个运行的协程结构体的指针
  - `gFree ...` 状态为 `_Gdead` 的空闲协程结构的队列
- `GOMAXPROCS` 个线程运行在用户态，默认为 CPU 核数。一个线程绑定一个调度器。同时存在一个全局待执行协程队列 `runtime.sched.runq`
- go 关键字执行，`newproc` 函数：
  - 从当前线程的调度器的空闲队列中获取一个协程结构，如果没有就新建一个并分配栈空间
  - 将入口函数的参数整片拷贝到新协程的栈中
  - 新协程加入队列，`runqput` 函数：新协程的状态置为 `_Grunnable`，特权式地添加到调度器中，协程的指针直接设置至 `runnext` 字段。如果队列已满，将之前的 `runnext` 发配到全局队列
- 协程切换，`gopark` 函数：
  - 切换至调度协程 `g0`，`mcall` 函数：汇编实现，保存当前协程程序指针、栈指针，设置 CPU 寄存切换至调度协程
  - 处理当前协程，`park_m` 函数：当前协程状态置为 `_Gwaiting`
  - 获取下一协程，`schedule` 函数：一定几率从全局队列获取，否则从当前线程的调度器队列获取，否则阻塞地从其它调度器获取
  - 执行下一协程，`execute` 函数：状态置为 `_Grunning`，建立与线程的关系，在汇编实现的 `gogo` 函数中设置 CPU 寄存切换至下一协程
- 系统调用，`syscall.Syscall` 函数：
  - 进入，`entersyscall` 函数：保存当前的程序指针、栈指针，当前协程状态置为 `_Gsyscall`，解除调度器与线程的绑定，线程陷入内核态
  - 退出，`exitsyscall` 函数：线程重新绑定调度器

#### channel/select
```golang
// src/runtime/chan.go
type hchan struct {
```
- `hchan` 结构体包含：
  - `buf unsafe.Pointer` 缓冲区队列
  - `qcount uint` 缓冲区的长度
  - `dataqsiz uint` 缓冲区的容量，因为是一个循环队列
  - `sendx uint` 写到哪一个下标
  - `recvx uint` 读到哪一个下标
  - `elemtype *_type` 缓冲区元素的类型信息
  - `elemsize uint16` 缓冲区元素的大小
  - `sendq waitq` 因为写而阻塞于此的协程列表，元素类型为 `*sudog`，双向链表
  - `recvq waitq` 因为读而阻塞于此的协程列表
- 创建 channel，`makechan` 函数：如果无缓冲器，则不为 `buf` 分配空间；否则如果元素不为指针类型，则为 `buf` 分配空间和 `hchan` 连续的空间；否则为 `buf` 分配独立的空间
- 向 channel 发送，`chansend1` 函数：
  - 如果 channel 为 `nil`，则协程永远阻塞
  - 如果 channel 已关闭，则 panic
  - 如果有因为读而阻塞于此的协程，`send` 函数：
    - 将接收方的 `sudog` 移出 `recvq`
    - 将消息拷贝在 `sudog` 中的接收变量的地址
    - 将接收方协程的状态从 `_Gwaiting` 置为 `_Grunnable`，同样特权式地将协程插入到调度器的队列
    - 发送方协程不会阻塞，状态始终是 `_Grunning`
  - 否则如果 channel 有缓冲区且未满，则将消息拷贝到缓冲区尾部
  - 否则，阻塞发送：
    - 将当前协程以及发送变量的指针存入 `sudog`，将  `sudog` 加入 `sendq`
    - 调用 `gopark` 暂停当前协程
    - 等接收操作到来时，此协程会被重新调度
- 从 channel 接收，`chanrecv1` 函数：
  - 如果 channel 为 `nil`，则协程永远阻塞
  - 如果 channel 已关闭且缓冲区为空，则将接收变量置零并返回
  - 如果有因为写而阻塞于此的协程，`recv` 函数：
    - 将发送方的 `sudog` 移出 `sendq`
    - 将消息从在 `sudog` 中的发送变量的地址拷贝，如果有缓冲区且不空，则将消息拷贝到缓冲区尾部，将头部出队并拷贝到接收变量，否则将消息拷贝到接收变量
    - 将发送方协程的状态从 `_Gwaiting` 置为 `_Grunnable`，同样特权式地将协程插入到调度器的队列
    - 接收方协程不会阻塞，状态始终是 `_Grunning`
  - 否则如果 channel 有缓冲区且不空，则将头部出队并拷贝到接收变量
  - 否则，阻塞接收，过程与发送对偶
- 关闭 channel，`closechan` 函数：
  - 如果 channel 为 nil 或已关闭，则 panic
  - 所有 `sendq` 和 `recvq` 中的协程的状态从 `_Gwaiting` 置为 `_Grunnable`，同样特权式地将协程插入到调度器的队列
- select 块中没有任何 case 或 default，则协程永远阻塞
- select 块中只有一个 case 且没有 default，则退化为没有 select 的单个 channel 操作
- select 块中只有一个 case 和一个 default：
  - 退化为 if case else default 的执行
  - case 的 channel 操作执行 `selectnbsend`/`selectnbrecv` 函数：
    - 与 `chansend1`/`chanrecv1` 的差别仅在于：
      - 如果 channel 为 `nil` 则返回
      - 在最后的阻塞操作之前返回
    - 当且仅当以上情况返回 `false` 作为 if 的条件
- select 块中为其他情况时，通过 `selectgo` 函数确定一个执行分支：
  - 随机确定 case 的遍历考察顺序
    - 如果 channel 为 `nil`，下一个
    - 如果是写操作：
      - 如果 channel 已关闭，则 panic
      - 如果有因为读而阻塞于此的协程，`send` 函数
      - 否则如果 channel 有缓冲区且未满，则将消息拷贝到缓冲区尾部
      - 以上情况会确定执行此 case，否则下一个
    - 如果是读操作：
      - 如果有因为写而阻塞于此的协程，`recv` 函数
      - 否则如果 channel 有缓冲区且不空，则将头部出队并拷贝到接收变量
      - 否则如果 channel 已关闭，则将接收变量置零
      - 以上情况会确定执行此 case，否则下一个
  - 如果没有选择一个 case 作为执行分支，则执行 default
  - 如果没有 default：
    - 加入到所有 channel 的 `sendq` 或 `recvq`
    - 调用 `gopark` 暂停当前协程
    - 等接收或发送操作到来时，此协程会被重新调度，并离开所有加入的 `sendq` 或 `recvq`

