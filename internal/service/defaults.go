package service

type DefaultPeriod struct {
	Name string `json:"name"`
	Time string `json:"time"`
}

var defaultPeriods = []DefaultPeriod{
	{Name: "第1节", Time: "8:00-8:40"},
	{Name: "第2节", Time: "8:55-9:35"},
	{Name: "第3节", Time: "10:05-10:45"},
	{Name: "第4节", Time: "11:00-11:40"},
	{Name: "第5节", Time: "13:00-13:40"},
	{Name: "第6节", Time: "13:55-14:35"},
	{Name: "第7节", Time: "15:05-15:45"},
	{Name: "第8节", Time: "16:00-16:30"},
}

func GetDefaultPeriods() []DefaultPeriod { return defaultPeriods }

type LegendItem struct {
	Abbr    string `json:"abbr"`
	Full    string `json:"full"`
	Special bool   `json:"special"`
}

var defaultLegend = []LegendItem{
	{Abbr: "语", Full: "语文"},
	{Abbr: "阅", Full: "语文阅读"},
	{Abbr: "数", Full: "数学"},
	{Abbr: "英", Full: "英语"},
	{Abbr: "道", Full: "道德与法治"},
	{Abbr: "历", Full: "历史"},
	{Abbr: "地", Full: "地理"},
	{Abbr: "生", Full: "生物"},
	{Abbr: "体", Full: "体育"},
	{Abbr: "劳", Full: "劳动"},
	{Abbr: "信", Full: "信息"},
	{Abbr: "综", Full: "综合实践"},
	{Abbr: "校本", Full: "校本课程"},
	{Abbr: "地方", Full: "地方课程"},
	{Abbr: "活", Full: "体活课"},
	{Abbr: "班", Full: "班会"},
	{Abbr: "数e / 英e", Full: "数学 / 英语学科答疑课", Special: true},
	{Abbr: "音/美", Full: "音乐与美术共用课时（单周美术、双周音乐）", Special: true},
}

func GetDefaultLegend() []LegendItem { return defaultLegend }